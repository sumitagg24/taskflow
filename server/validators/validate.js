'use strict';

// Shared express-validator result handler. Mount after a validator chain:
// validation failures become 400 { message } (joined messages), matching the
// shape the controllers already use for their manual checks.
const { validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array().map((e) => e.msg).join(', ') });
  }
  return next();
};

module.exports = validate;
