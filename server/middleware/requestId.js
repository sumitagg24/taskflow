const crypto = require('crypto');

// Attach a unique request ID to every request
module.exports = function requestId(req, res, next) {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
