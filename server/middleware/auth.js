const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const tokenDenylist = require('../utils/tokenDenylist');

const ACCESS_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable is required in production');
  }
  console.warn('WARNING: JWT_SECRET is not set — using an ephemeral secret for this session. Set JWT_SECRET in production.');
}

if (!REFRESH_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_REFRESH_SECRET environment variable is required in production');
  }
  console.warn('WARNING: JWT_REFRESH_SECRET is not set — using the same secret as access tokens. Set JWT_REFRESH_SECRET in production.');
}

const activeAccessSecret = ACCESS_SECRET || crypto.randomBytes(32).toString('hex');
const activeRefreshSecret = REFRESH_SECRET || activeAccessSecret;

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const CLOCK_SKEW_SECONDS = 30;

const generateAccessToken = (userId) => {
  return jwt.sign(
    {
      sub: userId.toString(),
      id: userId,
      type: 'access',
      token_type: 'access',
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID(),
    },
    activeAccessSecret,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
};

const generateRefreshToken = (userId) => {
  const token = jwt.sign(
    {
      sub: userId.toString(),
      id: userId,
      type: 'refresh',
      token_type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID(),
    },
    activeRefreshSecret,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  return token;
};

const verifyToken = (token, secret) => {
  return jwt.verify(token, secret, { algorithms: ['HS256'], clockTolerance: CLOCK_SKEW_SECONDS });
};

const verifyAccessToken = (token) => {
  return verifyToken(token, activeAccessSecret);
};

const verifyRefreshToken = (token) => {
  return verifyToken(token, activeRefreshSecret);
};

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = verifyAccessToken(token);
    if (decoded.token_type !== 'access' && decoded.type !== 'access') {
      return res.status(401).json({ message: 'Invalid token type' });
    }
    if (tokenDenylist.has(token)) {
      return res.status(401).json({ message: 'Not authorized, token invalid' });
    }
    req.user = await User.findById(decoded.id);
    if (!req.user) {
      return res.status(401).json({ message: 'User not found' });
    }
    // Reject access tokens issued before the password last changed —
    // a password change/reset revokes all previously-issued sessions.
    if (req.user.passwordChangedAt && decoded.iat) {
      const issuedAtMs = decoded.iat * 1000;
      if (issuedAtMs < req.user.passwordChangedAt.getTime()) {
        return res.status(401).json({ message: 'Session expired, please sign in again', code: 'TOKEN_EXPIRED' });
      }
    }
    if (!req.user.emailVerified) {
      return res.status(403).json({
        message: 'Please verify your email before accessing this resource.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ message: 'Not authorized, token invalid' });
  }
};

module.exports = {
  protect,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
