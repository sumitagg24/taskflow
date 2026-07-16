const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

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
    avatar: {
      type: String,
      default: '',
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
      enum: ['local', 'google'],
      default: 'local',
    },
    googleId: { type: String, default: undefined, unique: true, sparse: true },

    // Refresh token (hashed)
    refreshToken: { type: String, default: undefined },

    // Account lockout
    loginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },

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
  },
  {
    timestamps: true,
  }
);

userSchema.index({ emailVerificationToken: 1 }, { sparse: true });
userSchema.index({ resetPasswordToken: 1 }, { sparse: true });
userSchema.index({ username: 1 }, { unique: true });

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

module.exports = mongoose.model('User', userSchema);
