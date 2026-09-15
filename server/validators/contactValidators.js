const { body } = require('express-validator');

// Public contact form. Caps are deliberately tight: the message is emailed
// to support, so unbounded fields become a spam/megaphone vector.
const contactValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .isLength({ max: 254 })
    .withMessage('Email is too long')
    .normalizeEmail(),
  body('subject')
    .trim()
    .notEmpty()
    .withMessage('Subject is required')
    .isLength({ min: 4, max: 120 })
    .withMessage('Subject must be between 4 and 120 characters'),
  body('message')
    .trim()
    .notEmpty()
    .withMessage('Message is required')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Message must be between 10 and 2000 characters'),
];

module.exports = { contactValidator };
