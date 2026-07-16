const User = require('../models/User');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../middleware/auth');
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
      if (existingUser.email === normalizedEmail) {
        return res.status(400).json({ message: 'Email already registered' });
      }
      return res.status(400).json({ message: 'Username is already taken' });
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

    try {
      await sendVerificationEmail(email, verificationToken);
    } catch {
      logger.warn('Failed to send verification email, but user was created');
    }

    const auth = await createAuthResponse(user);

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

    let user;
    if (isEmail) {
      user = await User.findOne({ email: trimmed.toLowerCase() }).select('+password');
    } else {
      user = await User.findOne({ username: trimmed.toLowerCase() }).select('+password');
    }

    if (!user) {
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
        email: user.email,
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

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    const auth = await createAuthResponse(user);

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

    const { refreshToken } = req.body;
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

    user.password = newPassword;
    user.refreshToken = undefined;
    await user.save();

    res.json({ message: 'Password changed successfully' });
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
          username: normalizedEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 30) || `user_${Date.now()}`,
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
        } else {
          throw err;
        }
      }
    }

    const auth = await createAuthResponse(user);
    res.json(auth);
  } catch (error) {
    next(error);
  }
};

// -------------------- Logout --------------------
exports.logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      const hashedToken = hashToken(refreshToken);
      await User.findOneAndUpdate(
        { refreshToken: hashedToken },
        { $unset: { refreshToken: '' } }
      );
    }

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
    if (avatar !== undefined) user.avatar = avatar;
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
