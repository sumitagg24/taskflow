const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Avatars are rendered as <img src> by clients, so only allow https URLs and
// inline data:image/ URIs. Empty string means "no avatar". CR/LF are rejected
// to block header/log injection via the stored value.
const isValidAvatarUrl = (v) => {
  if (v === undefined || v === null || v === '') return true;
  if (typeof v !== 'string') return false;
  if (/[\r\n]/.test(v)) return false;
  return v.startsWith('https://') || v.startsWith('data:image/');
};

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      trim: true,
      lowercase: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
      match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    // When the password last changed — used to reject access tokens issued
    // before the change (revokes all pre-change sessions).
    passwordChangedAt: { type: Date, default: undefined },
    avatar: {
      type: String,
      default: '',
      maxlength: [2048, 'Avatar URL is too long'],
      validate: {
        validator: function (v) {
          return isValidAvatarUrl(v);
        },
        message: 'Avatar must be an https:// URL or a data:image/ URI',
      },
    },
    bio: {
      type: String,
      default: '',
      maxlength: [500, 'Bio cannot exceed 500 characters'],
    },
    preferences: {
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'dark' },
      notifications: { type: Boolean, default: true },
      emailNotifications: { type: Boolean, default: true },
    },
    pomodoroSettings: {
      workDuration: { type: Number, default: 25 },
      breakDuration: { type: Number, default: 5 },
      longBreakDuration: { type: Number, default: 15 },
      sessionsBeforeLongBreak: { type: Number, default: 4 },
    },
    focusTimeToday: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastActiveDate: { type: Date, default: null },

    // Email verification
    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, default: undefined },
    emailVerificationExpires: { type: Date, default: undefined },

    // Password reset
    resetPasswordToken: { type: String, default: undefined },
    resetPasswordExpires: { type: Date, default: undefined },

    // Auth provider
    authProvider: {
      type: String,
      enum: ['local', 'google', 'github'],
      default: 'local',
    },
    googleId: { type: String, default: undefined, unique: true, sparse: true },
    githubId: { type: String, default: undefined, unique: true, sparse: true },

    // One-time OAuth exchange code. The redirect flow finishes on the server,
    // so we hand the browser a short-lived opaque code instead of putting JWTs
    // in a URL (they leak into history, referrers and access logs). The client
    // POSTs it straight back to /api/auth/oauth/exchange for the real tokens.
    oauthExchangeToken: { type: String, default: undefined },
    oauthExchangeExpires: { type: Date, default: undefined },

    // Refresh token (hashed)
    refreshToken: { type: String, default: undefined },

    // Account lockout with exponential backoff (see config/rateLimit.js).
    // loginAttempts counts consecutive failures inside the current streak;
    // lockoutLevel counts consecutive blocks (L in BASE * 2^(L-1)), reset on
    // successful login so legit users recover immediately.
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lockoutLevel: { type: Number, default: 0 },

    // AI provider settings (per-user, stored securely)
    aiProvider: {
      type: String,
      default: null,
    },
    aiApiKey: {
      type: String,
      default: '',
      select: false,
    },
    aiModel: {
      type: String,
      default: '',
    },
    aiBaseUrl: {
      type: String,
      default: '',
    },
    aiSettings: {
      temperature: { type: Number, default: 0.3 },
      maxTokens: { type: Number, default: 500 },
      streaming: { type: Boolean, default: false },
      timeout: { type: Number, default: 30000 },
    },

    // Daily AI request quota (see config/plans.js `aiRequestsPerDay` and
    // growthController.checkAndIncrementAiUsage). The counter belongs to the
    // UTC calendar day named by aiUsageDate (`YYYY-MM-DD`); a new day resets
    // it to zero on next use.
    aiUsageCount: { type: Number, default: 0 },
    aiUsageDate: { type: String, default: null },

    // ── Plan & growth ──────────────────────────────────────────────────────
    // Plan is the enforcement point for usage limits (see config/plans.js).
    // It is deliberately NOT writable through updateProfile — only billing or
    // a referral payout may move it.
    plan: {
      type: String,
      enum: ['free', 'pro', 'team'],
      default: 'free',
    },
    planSince: { type: Date, default: Date.now },

    // Short shareable code. Minted lazily on first read rather than at signup
    // so existing accounts pick one up without a migration.
    referralCode: { type: String, default: undefined, unique: true, sparse: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referralCredits: { type: Number, default: 0 },

    // Invites this user has sent. Stored on the user (rather than its own
    // collection) because the list is small, always read with the owner, and
    // never queried across users.
    invites: [
      {
        email: { type: String, required: true, lowercase: true, trim: true },
        invitedAt: { type: Date, default: Date.now },
        acceptedAt: { type: Date, default: null },
        acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      },
    ],
  },
  {
    timestamps: true,
  }
);

userSchema.index({ emailVerificationToken: 1 }, { sparse: true });
userSchema.index({ resetPasswordToken: 1 }, { sparse: true });
userSchema.index({ oauthExchangeToken: 1 }, { sparse: true });
userSchema.index({ username: 1 }, { unique: true });

// Shared with the profile-update path so API validation rejects exactly what
// the schema would reject (with a 400 instead of a 500).
userSchema.statics.isValidAvatarUrl = isValidAvatarUrl;

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshToken;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  delete obj.emailVerificationToken;
  delete obj.emailVerificationExpires;
  delete obj.oauthExchangeToken;
  delete obj.oauthExchangeExpires;
  delete obj.aiApiKey;
  return obj;
};

userSchema.methods.createEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  return token;
};

userSchema.methods.createPasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
  this.resetPasswordExpires = Date.now() + 30 * 60 * 1000;
  return token;
};

/**
 * Mint a single-use code the browser can trade for a real token pair. Short
 * TTL (60s) because it only has to survive one redirect hop, and stored hashed
 * so a database read cannot be replayed into a session.
 */
userSchema.methods.createOAuthExchangeToken = function () {
  const token = crypto.randomBytes(32).toString('hex');
  this.oauthExchangeToken = crypto.createHash('sha256').update(token).digest('hex');
  this.oauthExchangeExpires = Date.now() + 60 * 1000;
  return token;
};

/**
 * Referral codes are shown to humans and retyped, so the alphabet drops the
 * characters people confuse (0/O, 1/I/L). Not a secret: it only identifies who
 * gets credit for a signup, and the credit is capped server-side.
 */
const REFERRAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

userSchema.methods.ensureReferralCode = function () {
  if (this.referralCode) return this.referralCode;
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += REFERRAL_ALPHABET[bytes[i] % REFERRAL_ALPHABET.length];
  }
  this.referralCode = code;
  return code;
};

module.exports = mongoose.model('User', userSchema);
