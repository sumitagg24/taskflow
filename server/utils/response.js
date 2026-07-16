// Consistent API response format for all endpoints.
// Wraps every response in a standard structure with requestId, success flag, and timestamp.

function success(res, data = null, statusCode = 200) {
  const response = {
    success: true,
    timestamp: new Date().toISOString(),
    requestId: res.req?.requestId || 'unknown',
  };
  if (data !== null) {
    response.data = data;
  }
  return res.status(statusCode).json(response);
}

function created(res, data = null) {
  return success(res, data, 201);
}

function error(res, message = 'Internal Server Error', statusCode = 500, code = null) {
  const response = {
    success: false,
    timestamp: new Date().toISOString(),
    requestId: res.req?.requestId || 'unknown',
    message,
  };
  if (code) response.code = code;
  return res.status(statusCode).json(response);
}

function badRequest(res, message = 'Bad request', code = null) {
  return error(res, message, 400, code);
}

function notFound(res, message = 'Resource not found', code = null) {
  return error(res, message, 404, code);
}

function unauthorized(res, message = 'Unauthorized', code = null) {
  return error(res, message, 401, code);
}

function forbidden(res, message = 'Forbidden', code = null) {
  return error(res, message, 403, code);
}

function tooMany(res, message = 'Too many requests', code = null) {
  return error(res, message, 429, code);
}

module.exports = {
  success,
  created,
  error,
  badRequest,
  notFound,
  unauthorized,
  forbidden,
  tooMany,
};
