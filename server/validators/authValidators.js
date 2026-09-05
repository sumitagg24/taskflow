const { body } = require('express-validator');

const passwordRule = body('password')
  .trim()
  .notEmpty()
  .withMessage('Password is required')
  .isLength({ min: 8 })
  .withMessage('Password must be at least 8 characters')
  .matches(/[A-Z]/)
  .withMessage('Password must contain an uppercase letter')
  .matches(/[a-z]/)
  .withMessage('Password must contain a lowercase letter')
  .matches(/\d/)
  .withMessage('Password must contain a number')
  .matches(/[^a-zA-Z0-9]/)
  .withMessage('Password must contain a special character');

const emailRule = body('email')
  .trim()
  .notEmpty()
  .withMessage('Email is required')
  .isEmail()
  .withMessage('Please provide a valid email')
  .normalizeEmail();

const identifierRule = body('identifier')
  .trim()
  .notEmpty()
  .withMessage('Email or Username is required');

// Sign-in only checks that *something* was submitted. Re-running the signup
// complexity rules here would (a) leak the password policy to anyone probing
// the endpoint, (b) turn a failed login into a 400 instead of a generic 401,
// and (c) permanently lock out any account whose password predates the current
// policy. Correctness of the secret is `comparePassword`'s job.
const loginPasswordRule = body('password')
  .notEmpty()
  .withMessage('Password is required')
  .isLength({ max: 200 })
  .withMessage('Invalid credentials');

const usernameRule = body('username')
  .trim()
  .notEmpty()
  .withMessage('Username is required')
  .isLength({ min: 3, max: 30 })
  .withMessage('Username must be between 3 and 30 characters')
  .matches(/^[a-zA-Z0-9_]+$/)
  .withMessage('Username can only contain letters, numbers, and underscores');

const registerValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  usernameRule,
  emailRule,
  passwordRule,
];

const loginValidator = [identifierRule, loginPasswordRule];

const forgotPasswordValidator = [emailRule];

const resetPasswordValidator = [
  body('token')
    .trim()
    .notEmpty()
    .withMessage('Reset token is required'),
  passwordRule,
];

const verifyEmailValidator = [
  body('token')
    .trim()
    .notEmpty()
    .withMessage('Verification token is required'),
];

const resendVerificationValidator = [emailRule];

const changePasswordValidator = [
  body('currentPassword')
    .trim()
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .trim()
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/[A-Z]/)
    .withMessage('New password must contain an uppercase letter')
    .matches(/[a-z]/)
    .withMessage('New password must contain a lowercase letter')
    .matches(/\d/)
    .withMessage('New password must contain a number')
    .matches(/[^a-zA-Z0-9]/)
    .withMessage('New password must contain a special character'),
];

const googleAuthValidator = [
  body('credential')
    .trim()
    .notEmpty()
    .withMessage('Google credential is required')
    .isLength({ max: 8192 })
    .withMessage('Invalid Google credential'),
];

const refreshTokenValidator = [
  // Optional so cookie-only refresh (no body) passes validation; the handler
  // falls back to the `refreshToken` cookie, while body clients still validate.
  body('refreshToken')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Refresh token is required'),
];

const usernameCheckValidator = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
];

const oauthExchangeValidator = [
  body('code')
    .trim()
    .notEmpty()
    .withMessage('Exchange code is required')
    .isLength({ min: 64, max: 64 })
    .withMessage('Invalid exchange code')
    .matches(/^[a-f0-9]+$/)
    .withMessage('Invalid exchange code'),
];

module.exports = {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  verifyEmailValidator,
  resendVerificationValidator,
  changePasswordValidator,
  googleAuthValidator,
  refreshTokenValidator,
  usernameCheckValidator,
  oauthExchangeValidator,
};
