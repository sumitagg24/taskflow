const express = require('express');
const router = express.Router();
const {
  register, login, getProfile, updateProfile, updateFocusTime,
  forgotPassword, resetPassword, verifyEmail, resendVerification,
  refreshToken, changePassword, googleAuth, logout, checkUsername,
  githubStart, githubCallback, exchangeOAuthCode, getAuthProviders,
} = require('../controllers/authController');
const {
  registerValidator, loginValidator, forgotPasswordValidator,
  resetPasswordValidator, verifyEmailValidator, resendVerificationValidator,
  changePasswordValidator, googleAuthValidator, refreshTokenValidator,
  usernameCheckValidator, oauthExchangeValidator,
} = require('../validators/authValidators');
const { protect } = require('../middleware/auth');
const {
  authLimiter, emailLimiter, passwordResetLimiter,
  verificationLimiter, oauthLimiter, changePasswordLimiter,
  refreshLimiter, logoutLimiter,
} = require('../middleware/rateLimiter');

// Public routes
router.post('/register', authLimiter, registerValidator, register);
router.post('/login', authLimiter, loginValidator, login);
router.post('/check-username', authLimiter, usernameCheckValidator, checkUsername);
router.post('/forgot-password', passwordResetLimiter, forgotPasswordValidator, forgotPassword);
router.post('/reset-password', passwordResetLimiter, resetPasswordValidator, resetPassword);
router.post('/verify-email', verificationLimiter, verifyEmailValidator, verifyEmail);
router.post('/resend-verification', emailLimiter, resendVerificationValidator, resendVerification);
router.post('/google', oauthLimiter, googleAuthValidator, googleAuth);
router.get('/providers', getAuthProviders);
router.get('/github', oauthLimiter, githubStart);
router.get('/github/callback', oauthLimiter, githubCallback);
router.post('/oauth/exchange', oauthLimiter, oauthExchangeValidator, exchangeOAuthCode);
router.post('/refresh-token', refreshLimiter, refreshTokenValidator, refreshToken);
router.post('/logout', logoutLimiter, logout);

// Protected routes
router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.post('/focus-time', protect, updateFocusTime);
router.post('/change-password', protect, changePasswordLimiter, changePasswordValidator, changePassword);

module.exports = router;
