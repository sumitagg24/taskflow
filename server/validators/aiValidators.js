'use strict';

// Strict input chains for the AI endpoints. Every body field is REQUIRED to be
// a non-empty string capped at 4000 chars so oversized prompts cannot be used
// to blow up upstream token usage; :id params must be MongoIds.
const { body, param } = require('express-validator');

const MAX_AI_INPUT = 4000;

const parseTaskValidator = [
  body('input')
    .exists()
    .withMessage('Input text is required')
    .isString()
    .withMessage('Input text must be a string')
    .trim()
    .isLength({ min: 1, max: MAX_AI_INPUT })
    .withMessage(`Input text must be between 1 and ${MAX_AI_INPUT} characters`),
];

const chatValidator = [
  body('message')
    .exists()
    .withMessage('Message is required')
    .isString()
    .withMessage('Message must be a string')
    .trim()
    .isLength({ min: 1, max: MAX_AI_INPUT })
    .withMessage(`Message must be between 1 and ${MAX_AI_INPUT} characters`),
];

const generateTitleValidator = [
  body('description')
    .exists()
    .withMessage('Description is required')
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ min: 1, max: MAX_AI_INPUT })
    .withMessage(`Description must be between 1 and ${MAX_AI_INPUT} characters`),
];

const breakdownTaskValidator = [
  param('id').isMongoId().withMessage('Invalid task ID'),
];

module.exports = {
  MAX_AI_INPUT,
  parseTaskValidator,
  chatValidator,
  generateTitleValidator,
  breakdownTaskValidator,
};
