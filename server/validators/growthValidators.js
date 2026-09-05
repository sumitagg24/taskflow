'use strict';

// Strict input chains for growth routes. The invite email must be a real,
// length-capped address (normalized); the revoke :email param validates the
// same way so malformed values 400 instead of falling through to a 404.
const { body, param } = require('express-validator');

const inviteEmailValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 254 })
    .withMessage('Email cannot exceed 254 characters'),
];

const revokeInviteValidator = [
  param('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 254 })
    .withMessage('Email cannot exceed 254 characters'),
];

module.exports = {
  inviteEmailValidator,
  revokeInviteValidator,
};
