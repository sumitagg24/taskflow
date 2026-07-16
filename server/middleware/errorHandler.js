const logger = require('../utils/logger');
const response = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  logger.error(`Error: ${err.message}`, { requestId, stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined });

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return response.error(res, messages.join(', '), 400);
  }

  if (err.code === 11000) {
    return response.error(res, 'Duplicate field value', 400);
  }

  if (err.name === 'CastError') {
    return response.error(res, 'Resource not found', 400);
  }

  if (err.message === 'Not allowed by CORS') {
    return response.error(res, 'Origin not allowed', 403);
  }

  const statusCode = err.statusCode || 500;
  response.error(res, process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message, statusCode);
};

module.exports = errorHandler;
