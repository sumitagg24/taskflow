const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken, getCookie, setAuthCookies, clearAuthCookies } = require('../middleware/auth');
const { validationResult } = require('express-validator');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { isCommonPassword } = require('../services/passwordService');
const logger = require('../utils/logger');
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  getEmailStatus,
} = require('../services/emailService');
const { attributeReferral } = require('./growthController');
const { isBlocked, recordFail } = require('../utils/loginAttemptTracker');
const tokenDenylist = require('../utils/tokenDenylist');

// Account lockout configuration
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

const validate = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error(errors.array().map((e) => e.msg).join(', '));
    error.statusCode = 400;
    throw error;
  }
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// bcrypt truncates at 72 bytes, and a password built from the account's own
// identity is trivially guessable. Case-insensitive: equals the email, equals
// the username, or contains the email local-part (before @) when it is ≥4 chars.
const passwordMatchesIdentity = (password, email, username) => {
  if (!password) return false;
  const pw = String(password).toLowerCase();
  const em = String(email || '').toLowerCase().trim();
  const un = String(username || '').toLowerCase().trim();
  if (em && pw === em) return true;
  if (un && pw === un) return true;
  const local = em.split('@')[0] || '';
  if (local.length >= 4 && pw.includes(local)) return true;
  return false;
};

const createAuthResponse = async (user) => {
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = hashToken(refreshToken);
  await user.save();

  return {
    accessToken,
    refreshToken,
    user: user.toJSON(),
  };
};

const USER_FIELDS =
  '_id name username email avatar bio preferences pomodoroSettings focusTimeToday streak emailVerified authProvider';

// -------------------- Check Username --------------------
exports.checkUsername = async (req, res, next) => {
  try {
    validate(req);

    const { username } = req.body;
    const normalizedUsername = username.toLowerCase().trim();

    const existingUser = await User.findOne({ username: normalizedUsername });
    res.json({ available: !existingUser });
  } catch (error) {
    next(error);
  }
};

// -------------------- Register --------------------
exports.register = async (req, res, next) => {
  try {
    validate(req);

    const { name, username, email, password } = req.body;
    const normalizedUsername = username.toLowerCase().trim();
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      $or: [{ email: normalizedEmail }, { username: normalizedUsername }],
    });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email or username already exists' });
    }

    if (passwordMatchesIdentity(password, normalizedEmail, normalizedUsername)) {
      return res.status(400).json({ message: 'Password must not contain your email or username' });
    }

    if (isCommonPassword(password)) {
      return res.status(400).json({ message: 'This password is too common. Please choose a stronger password.' });
    }

    const user = await User.create({
      name,
      username: normalizedUsername,
      email: normalizedEmail,
      password,
      authProvider: 'local',
    });
    const verificationToken = user.createEmailVerificationToken();
    await user.save();

    // Referral attribution is best-effort: a stale or bogus `referralCode`
    // must never stop somebody creating an account.
    if (req.body.referralCode) {
      await attributeReferral(user, req.body.referralCode);
    }

    try {
      await sendVerificationEmail(email, verificationToken);
    } catch {
      logger.warn('Failed to send verification email, but user was created');
    }

    const auth = await createAuthResponse(user);

    setAuthCookies(res, auth.accessToken, auth.refreshToken);
    res.status(201).json({
      ...auth,
      message: 'Account created! Please check your email to verify your account.',
    });
  } catch (error) {
    next(error);
  }
};

// -------------------- Login --------------------
exports.login = async (req, res, next) => {
  try {
    validate(req);

    const { identifier, password } = req.body;
    const trimmed = identifier.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);

    // Per-IP brute-force backoff (complements per-account lockout below).
    // Same 429 shape as an account lockout so a blocked IP is
    // indistinguishable from a locked account (no new oracle).
    const ip = req.ip;
    if (isBlocked(ip)) {
      return res.status(429).json({
        message: `Account temporarily locked. Try again in ${LOCKOUT_DURATION_MINUTES} minute(s).`,
        code: 'ACCOUNT_LOCKED',
      });
    }

    let user;
    if (isEmail) {
      user = await User.findOne({ email: trimmed.toLowerCase() }).select('+password');
    } else {
      user = await User.findOne({ username: trimmed.toLowerCase() }).select('+password');
    }

    if (!user) {
      recordFail(ip);
      return res.status(401).json({ message: 'Invalid email/username or password' });
    }

    if (user.authProvider !== 'local') {
      return res.status(401).json({ message: 'Invalid email/username or password' });
    }

    // Check account lockout
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockUntil - new Date()) / 60000);
      return res.status(429).json({
        message: `Account temporarily locked. Try again in ${remainingMinutes} minute(s).`,
        code: 'ACCOUNT_LOCKED',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      recordFail(ip);
      // Increment failed login attempts
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
        user.loginAttempts = 0;
        await user.save();
        logger.warn(`Account locked for ${user.email} due to ${MAX_LOGIN_ATTEMPTS} failed attempts`);
        return res.status(429).json({
          message: `Account temporarily locked. Try again in ${LOCKOUT_DURATION_MINUTES} minute(s).`,
          code: 'ACCOUNT_LOCKED',
        });
      }
      await user.save();
      return res.status(401).json({ message: 'Invalid email/username or password' });
    }

    // Reset lockout on successful login
    if (user.loginAttempts > 0 || user.lockUntil) {
      user.loginAttempts = 0;
      user.lockUntil = null;
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        message: 'Please verify your email before signing in. Check your inbox for the verification link.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const today = new Date().toDateString();
    const lastActive = user.lastActiveDate ? new Date(user.lastActiveDate).toDateString() : null;

    if (lastActive !== today) {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      user.streak = lastActive === yesterday ? user.streak + 1 : 1;
      user.lastActiveDate = new Date();
      await user.save();
    }

    const auth = await createAuthResponse(user);

    setAuthCookies(res, auth.accessToken, auth.refreshToken);
    res.json(auth);
  } catch (error) {
    next(error);
  }
};

// -------------------- Email Verification --------------------
exports.verifyEmail = async (req, res, next) => {
  try {
    validate(req);

    const { token } = req.body;
    const hashedToken = hashToken(token);

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired verification token' });
    }

    if (user.emailVerified) {
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();
      return res.json({ message: 'Email already verified. You can sign in.' });
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    try {
      await sendWelcomeEmail(user.email, user.name);
    } catch (err) {
      logger.warn('Failed to send welcome email after verification:', err.message);
    }

    res.json({ message: 'Email verified successfully! You can now sign in.' });
  } catch (error) {
    next(error);
  }
};

exports.resendVerification = async (req, res, next) => {
  try {
    validate(req);
    const { email } = req.body;
    const requestId = req.requestId || 'unknown';

    const user = await User.findOne({ email });

    if (!user || user.emailVerified) {
      return res.json({
        message: 'If that email is registered and unverified, a new verification link has been sent.',
      });
    }

    const verificationToken = user.createEmailVerificationToken();
    await user.save();

    try {
      await sendVerificationEmail(email, verificationToken);
    } catch (err) {
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();
      return res.status(500).json({ message: 'Failed to send verification email. Please try again.' });
    }

    res.json({
      message: 'If that email is registered and unverified, a new verification link has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

// -------------------- Forgot Password --------------------
exports.forgotPassword = async (req, res, next) => {
  try {
    validate(req);

    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user || user.authProvider !== 'local') {
      return res.json({
        message: 'If that email is registered with a password-based account, a reset link has been sent.',
      });
    }

    const resetToken = user.createPasswordResetToken();
    await user.save();

    try {
      await sendPasswordResetEmail(email, resetToken);
    } catch {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();
      return res.status(500).json({ message: 'Failed to send reset email. Please try again.' });
    }

    res.json({
      message: 'If that email is registered with a password-based account, a reset link has been sent.',
    });
  } catch (error) {
    next(error);
  }
};

// -------------------- Reset Password --------------------
exports.resetPassword = async (req, res, next) => {
  try {
    validate(req);

    const { token, password } = req.body;

    const hashedToken = hashToken(token);
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    }).select('+password');

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    if (isCommonPassword(password)) {
      return res.status(400).json({ message: 'This password is too common. Please choose a stronger password.' });
    }

    if (passwordMatchesIdentity(password, user.email, user.username)) {
      return res.status(400).json({ message: 'Password must not contain your email or username' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    // Second precision to match the access token's `iat` claim, so a token
    // issued right after the change is never rejected by the guard.
    user.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);

    await user.save();

    const auth = await createAuthResponse(user);

    setAuthCookies(res, auth.accessToken, auth.refreshToken);
    res.json({
      message: 'Password reset successful. You can now sign in with your new password.',
      ...auth,
    });
  } catch (error) {
    next(error);
  }
};

// -------------------- Token Refresh --------------------
exports.refreshToken = async (req, res, next) => {
  try {
    validate(req);

    // Cookie-first, body fallback (keeps rotation/reuse tests green).
    const refreshToken = getCookie(req, 'refreshToken') || (req.body && req.body.refreshToken);
    if (!refreshToken) {
      return res.status(401).json({ message: 'Invalid or expired refresh token', code: 'REFRESH_INVALID' });
    }
    const hashedToken = hashToken(refreshToken);

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired refresh token', code: 'REFRESH_INVALID' });
    }

    if (decoded.token_type !== 'refresh' && decoded.type !== 'refresh') {
      return res.status(401).json({ message: 'Invalid token type' });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Invalid refresh token', code: 'REFRESH_INVALID' });
    }

    if (user.refreshToken !== hashedToken) {
      user.refreshToken = undefined;
      await user.save();
      return res.status(401).json({
        message: 'Invalid refresh token',
        code: 'REFRESH_INVALID',
      });
    }

    const auth = await createAuthResponse(user);

    setAuthCookies(res, auth.accessToken, auth.refreshToken);
    res.json({
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

// -------------------- Change Password (authenticated) --------------------
exports.changePassword = async (req, res, next) => {
  try {
    validate(req);

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.authProvider !== 'local') {
      return res.status(400).json({ message: 'Cannot change password for OAuth accounts. Use your provider settings.' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must be different from current password' });
    }

    if (isCommonPassword(newPassword)) {
      return res.status(400).json({ message: 'This password is too common. Please choose a stronger password.' });
    }

    if (passwordMatchesIdentity(newPassword, user.email, user.username)) {
      return res.status(400).json({ message: 'Password must not contain your email or username' });
    }

    user.password = newPassword;
    user.refreshToken = undefined;
    user.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await user.save();

    const auth = await createAuthResponse(user);

    setAuthCookies(res, auth.accessToken, auth.refreshToken);
    res.json({
      message: 'Password changed successfully',
      ...auth,
    });
  } catch (error) {
    next(error);
  }
};

// -------------------- Google OAuth --------------------
exports.googleAuth = async (req, res, next) => {
  try {
    validate(req);

    if (!googleClient) {
      return res.status(500).json({ message: 'Google authentication is not configured' });
    }

    const { credential } = req.body;
    const requestId = req.requestId || 'unknown';

    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ message: 'Google credential is required' });
    }

    if (credential.length > 8192) {
      return res.status(400).json({ message: 'Invalid Google credential' });
    }

    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (err) {
      logger.warn(`Google OAuth failure: invalid ID token: ${err.message}`);
      return res.status(401).json({ message: 'Invalid Google credential' });
    }

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture, email_verified } = payload;

    if (!email) {
      logger.warn(`Google OAuth: no email in ID token payload`);
      return res.status(400).json({ message: 'Google account must have an email address' });
    }

    if (!email_verified) {
      logger.warn(`Google OAuth: email not verified for ${email}`);
      return res.status(400).json({ message: 'Google email is not verified. Please verify your email with Google first.' });
    }

    const normalizedEmail = email.toLowerCase();

    let user = await User.findOne({ $or: [{ googleId }, { email: normalizedEmail }] });

    if (user) {
      if (user.authProvider === 'local' && !user.googleId) {
        logger.warn(`Google OAuth conflict: local account exists for ${normalizedEmail} — rejecting auto-link`);
        return res.status(409).json({
          message: 'This email is already registered with a password. Please sign in with your password to link your Google account.',
          code: 'ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER',
        });
      }

      if (user.googleId && user.googleId !== googleId) {
        logger.warn(`Google OAuth conflict: different Google account already linked for ${normalizedEmail}`);
        return res.status(409).json({
          message: 'This email is already associated with another account. Please sign in with your existing method.',
        });
      }

      if (user.authProvider === 'google' && user.googleId === googleId) {
        if (picture && user.avatar !== picture) {
          user.avatar = picture;
          await user.save();
        }
      }
    } else {
      try {
        user = await User.create({
          name: name || normalizedEmail.split('@')[0],
          username: await deriveUniqueUsername(normalizedEmail.split('@')[0]),
          email: normalizedEmail,
          authProvider: 'google',
          googleId,
          emailVerified: true,
          avatar: picture || '',
        });
        logger.info(`Google OAuth: created new user ${normalizedEmail}`);
      } catch (err) {
        if (err.code === 11000) {
          logger.warn(`Google OAuth: duplicate key for ${normalizedEmail} or ${googleId}`);
          user = await User.findOne({ $or: [{ googleId }, { email: normalizedEmail }] });
          if (user && user.authProvider === 'local' && !user.googleId) {
            return res.status(409).json({
              message: 'This email is already registered with a password. Please sign in with your password to link your Google account.',
              code: 'ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER',
            });
          }
          if (user && user.googleId && user.googleId !== googleId) {
            return res.status(409).json({
              message: 'This email is already associated with another account. Please sign in with your existing method.',
            });
          }
          if (user && user.googleId === googleId) {
            if (picture && user.avatar !== picture) {
              user.avatar = picture;
              await user.save();
            }
          }
          if (!user) {
            // Duplicate key with nothing to recover — a concurrent write we
            // cannot reconcile. Better a retryable 409 than a crash below.
            return res.status(409).json({
              message: 'Could not complete Google sign-in. Please try again.',
            });
          }
        } else {
          throw err;
        }
      }
    }

    const auth = await createAuthResponse(user);
    setAuthCookies(res, auth.accessToken, auth.refreshToken);
    res.json(auth);
  } catch (error) {
    next(error);
  }
};

// -------------------- GitHub OAuth --------------------
/* GitHub has no ID token, so this is the authorization-code dance: we bounce
   the browser to GitHub, it comes back with a `code`, and the server trades
   that for an access token using the client secret. The finished session is
   handed to the SPA as a single-use exchange code rather than a JWT in the
   URL — see User.createOAuthExchangeToken. */

const GITHUB_STATE_COOKIE = 'tf_gh_state';
const GITHUB_SCOPE = 'read:user user:email';

const githubConfigured = () =>
  Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);

const trimSlashes = (value) => String(value || '').replace(/\/+$/, '');

const clientOrigin = () => trimSlashes(process.env.CLIENT_URL) || 'http://localhost:3000';

// Defaults through the client origin so the dev proxy (:3000 → :5000) and the
// same-origin production build both work with one registered callback URL.
const githubCallbackUrl = () =>
  trimSlashes(process.env.GITHUB_CALLBACK_URL) || `${clientOrigin()}/api/auth/github/callback`;

const readCookie = (req, name) => {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
};

const authCallbackRedirect = (params) =>
  `${clientOrigin()}/auth/callback?${new URLSearchParams(params).toString()}`;

const sanitizeUsername = (raw) =>
  String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);

/**
 * Pick the first candidate that sanitizes to a free username, else append a
 * random suffix. Without this an OAuth signup whose derived handle is taken
 * fails with a raw duplicate-key error.
 */
const deriveUniqueUsername = async (...candidates) => {
  for (const candidate of candidates) {
    const base = sanitizeUsername(candidate);
    if (base.length < 3) continue;
    if (!(await User.exists({ username: base }))) return base;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = String(crypto.randomInt(1000, 10000));
      const withSuffix = `${base.slice(0, 29 - suffix.length)}_${suffix}`;
      if (!(await User.exists({ username: withSuffix }))) return withSuffix;
    }
  }
  return `user_${crypto.randomBytes(6).toString('hex')}`;
};

const githubFetch = async (url, accessToken) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'TaskFlow',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${url} responded ${response.status}`);
  }
  return response.json();
};

/** GET /api/auth/github — set a state cookie and bounce to GitHub. */
exports.githubStart = (req, res) => {
  if (!githubConfigured()) {
    return res.redirect(
      authCallbackRedirect({
        error: 'PROVIDER_NOT_CONFIGURED',
        message: 'GitHub sign-in is not configured on this server.',
      })
    );
  }

  const state = crypto.randomBytes(24).toString('hex');

  res.cookie(GITHUB_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60 * 1000,
    path: '/api/auth',
  });

  const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
  authorizeUrl.searchParams.set('client_id', process.env.GITHUB_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', githubCallbackUrl());
  authorizeUrl.searchParams.set('scope', GITHUB_SCOPE);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('allow_signup', 'true');

  res.redirect(authorizeUrl.toString());
};

/** GET /api/auth/github/callback — trade the code, upsert the user, hand back
 *  a one-time exchange code. Every failure lands on the SPA's /auth/callback
 *  with an `error`, never on a raw JSON error page. */
exports.githubCallback = async (req, res) => {
  const fail = (error, message, logLine) => {
    if (logLine) logger.warn(`GitHub OAuth: ${logLine}`);
    res.clearCookie(GITHUB_STATE_COOKIE, { path: '/api/auth' });
    return res.redirect(authCallbackRedirect({ error, message }));
  };

  try {
    if (!githubConfigured()) {
      return fail('PROVIDER_NOT_CONFIGURED', 'GitHub sign-in is not configured on this server.');
    }

    const { code, state, error: providerError } = req.query;

    if (providerError) {
      return fail(
        'PROVIDER_DENIED',
        'GitHub sign-in was cancelled.',
        `provider returned ${providerError}`
      );
    }

    const expectedState = readCookie(req, GITHUB_STATE_COOKIE);
    const stateOk =
      typeof state === 'string' &&
      typeof expectedState === 'string' &&
      state.length === expectedState.length &&
      crypto.timingSafeEqual(Buffer.from(state), Buffer.from(expectedState));

    if (!stateOk) {
      return fail(
        'STATE_MISMATCH',
        'Sign-in session expired. Please try again.',
        'state mismatch or missing state cookie'
      );
    }

    if (!code || typeof code !== 'string') {
      return fail('MISSING_CODE', 'GitHub did not return an authorization code.');
    }

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'TaskFlow',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: githubCallbackUrl(),
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenResponse.ok) {
      return fail(
        'TOKEN_EXCHANGE_FAILED',
        'GitHub rejected the sign-in. Please try again.',
        `token endpoint responded ${tokenResponse.status}`
      );
    }

    const tokenBody = await tokenResponse.json();
    const accessToken = tokenBody.access_token;

    if (!accessToken) {
      return fail(
        'TOKEN_EXCHANGE_FAILED',
        'GitHub rejected the sign-in. Please try again.',
        `token endpoint returned ${tokenBody.error || 'no access_token'}`
      );
    }

    const profile = await githubFetch('https://api.github.com/user', accessToken);
    const githubId = profile.id ? String(profile.id) : null;

    if (!githubId) {
      return fail('NO_PROFILE', 'Could not read your GitHub profile.');
    }

    // `profile.email` is only the *public* one, and most accounts hide it, so
    // fall back to the verified-address list that `user:email` grants us.
    let email = typeof profile.email === 'string' ? profile.email : null;
    if (!email) {
      const emails = await githubFetch('https://api.github.com/user/emails', accessToken);
      const list = Array.isArray(emails) ? emails : [];
      const chosen =
        list.find((e) => e.primary && e.verified) || list.find((e) => e.verified) || null;
      email = chosen ? chosen.email : null;
    }

    if (!email) {
      return fail(
        'NO_VERIFIED_EMAIL',
        'Your GitHub account has no verified email address. Add one on GitHub, then try again.',
        `no verified email for github id ${githubId}`
      );
    }

    const normalizedEmail = email.toLowerCase();

    let user = await User.findOne({ $or: [{ githubId }, { email: normalizedEmail }] });

    if (user) {
      if (!user.githubId && user.authProvider !== 'github') {
        return fail(
          'ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER',
          user.authProvider === 'google'
            ? 'This email already signs in with Google. Use the Google button instead.'
            : 'This email is already registered with a password. Sign in with your password instead.',
          `existing ${user.authProvider} account for ${normalizedEmail} — refusing auto-link`
        );
      }

      if (user.githubId && user.githubId !== githubId) {
        return fail(
          'ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER',
          'This email is already associated with another account.',
          `different github id already linked for ${normalizedEmail}`
        );
      }

      if (profile.avatar_url && user.avatar !== profile.avatar_url) {
        user.avatar = profile.avatar_url;
      }
    } else {
      user = new User({
        name: profile.name || profile.login || normalizedEmail.split('@')[0],
        username: await deriveUniqueUsername(profile.login, normalizedEmail.split('@')[0]),
        email: normalizedEmail,
        authProvider: 'github',
        githubId,
        emailVerified: true,
        avatar: profile.avatar_url || '',
      });
      logger.info(`GitHub OAuth: created new user ${normalizedEmail}`);
    }

    const isNewUser = user.isNew;
    const exchangeCode = user.createOAuthExchangeToken();

    try {
      await user.save();
    } catch (err) {
      if (err.code === 11000) {
        return fail(
          'ACCOUNT_EXISTS_WITH_DIFFERENT_PROVIDER',
          'This email is already associated with another account.',
          `duplicate key saving ${normalizedEmail}`
        );
      }
      throw err;
    }

    res.clearCookie(GITHUB_STATE_COOKIE, { path: '/api/auth' });
    return res.redirect(
      authCallbackRedirect({
        code: exchangeCode,
        provider: 'github',
        ...(isNewUser ? { new: '1' } : {}),
      })
    );
  } catch (error) {
    return fail('UNEXPECTED', 'Could not complete GitHub sign-in. Please try again.', error.message);
  }
};

// -------------------- OAuth code exchange --------------------
/** POST /api/auth/oauth/exchange — swap a single-use redirect code for tokens. */
exports.exchangeOAuthCode = async (req, res, next) => {
  try {
    validate(req);

    const { code } = req.body;

    const user = await User.findOne({
      oauthExchangeToken: hashToken(code),
      oauthExchangeExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        message: 'This sign-in link has expired. Please try again.',
        code: 'INVALID_EXCHANGE_CODE',
      });
    }

    // Single use: burn it before minting the session.
    user.oauthExchangeToken = undefined;
    user.oauthExchangeExpires = undefined;

    const auth = await createAuthResponse(user);
    setAuthCookies(res, auth.accessToken, auth.refreshToken);
    res.json(auth);
  } catch (error) {
    next(error);
  }
};

/** GET /api/auth/providers — lets the client hide buttons it cannot fulfil. */
exports.getAuthProviders = (req, res) => {
  res.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID),
    github: githubConfigured(),
  });
};

// -------------------- Logout --------------------
exports.logout = async (req, res, next) => {
  try {
    // Body-first, cookie fallback (cookie-only clients send no body).
    const refreshToken = (req.body && req.body.refreshToken) || getCookie(req, 'refreshToken');

    // Deny the presented access token for its remaining lifetime so a
    // logged-out JWT cannot be reused until its natural expiry. This route
    // is public (no `protect`), so verify the Bearer token here; a missing,
    // invalid, or already-expired token simply skips denylisting while the
    // refresh-token invalidation below still proceeds.
    const authHeader = req.headers.authorization;
    const cookieAccess = getCookie(req, 'accessToken');
    const candidate =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : cookieAccess;
    if (candidate) {
      try {
        const decoded = verifyAccessToken(candidate);
        if (decoded && Number.isFinite(decoded.exp)) {
          tokenDenylist.add(candidate, decoded.exp * 1000);
        }
      } catch {
        // Invalid/expired access token — nothing to deny; still 200.
      }
    }

    if (refreshToken) {
      const hashedToken = hashToken(refreshToken);
      await User.findOneAndUpdate(
        { refreshToken: hashedToken },
        { $unset: { refreshToken: '' } }
      );
    }

    clearAuthCookies(res);
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

// -------------------- Get Profile --------------------
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select(USER_FIELDS);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    next(error);
  }
};

// -------------------- Update Profile --------------------
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, bio, avatar, preferences, pomodoroSettings } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) {
      if (!User.isValidAvatarUrl(avatar) || String(avatar).length > 2048) {
        return res.status(400).json({ message: 'Avatar must be an https:// URL or a data:image/ URI' });
      }
      user.avatar = avatar;
    }
    if (preferences) {
      if (preferences.theme) user.preferences.theme = preferences.theme;
      if (preferences.notifications !== undefined) user.preferences.notifications = preferences.notifications;
      if (preferences.emailNotifications !== undefined) user.preferences.emailNotifications = preferences.emailNotifications;
    }
    if (pomodoroSettings) {
      if (pomodoroSettings.workDuration) {
        const wd = Number(pomodoroSettings.workDuration);
        if (wd >= 1 && wd <= 120) user.pomodoroSettings.workDuration = wd;
      }
      if (pomodoroSettings.breakDuration) {
        const bd = Number(pomodoroSettings.breakDuration);
        if (bd >= 1 && bd <= 60) user.pomodoroSettings.breakDuration = bd;
      }
      if (pomodoroSettings.longBreakDuration) {
        const lbd = Number(pomodoroSettings.longBreakDuration);
        if (lbd >= 1 && lbd <= 120) user.pomodoroSettings.longBreakDuration = lbd;
      }
      if (pomodoroSettings.sessionsBeforeLongBreak) {
        const s = Number(pomodoroSettings.sessionsBeforeLongBreak);
        if (s >= 1 && s <= 20) user.pomodoroSettings.sessionsBeforeLongBreak = s;
      }
    }

    await user.save();

    res.json({ user: user.toJSON() });
  } catch (error) {
    next(error);
  }
};

// -------------------- Update Focus Time --------------------
exports.updateFocusTime = async (req, res, next) => {
  try {
    const { minutes } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const numMinutes = Number(minutes);
    if (!Number.isFinite(numMinutes) || numMinutes <= 0 || numMinutes > 1440) {
      return res.status(400).json({ message: 'Invalid focus time duration' });
    }

    user.focusTimeToday += numMinutes;
    await user.save();

    res.json({ focusTimeToday: user.focusTimeToday });
  } catch (error) {
    next(error);
  }
};
