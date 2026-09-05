'use strict';

// Strict input chains for template routes, which previously had no validation
// at all. Title/category mirror the TaskTemplate schema caps; priority/status
// mirror its enums. Query filters (category/tag) stay unvalidated on purpose:
// free-form strings are matched with a typeof guard in the controller and a
// NoSQL-injection regression test pins the 200-with-empty-list behaviour.
const { body, param } = require('express-validator');

const TEMPLATE_STATUSES = ['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled'];
const TEMPLATE_PRIORITIES = ['critical', 'high', 'medium', 'low', 'none'];

const templateIdValidator = [
  param('id').isMongoId().withMessage('Invalid template ID'),
];

const createTemplateValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 100 })
    .withMessage('Title cannot exceed 100 characters'),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description cannot exceed 5000 characters'),
  body('category')
    .optional()
    .isString()
    .withMessage('Category must be a string')
    .trim()
    .isLength({ max: 100 })
    .withMessage('Category cannot exceed 100 characters'),
  body('priority')
    .optional()
    .isIn(TEMPLATE_PRIORITIES)
    .withMessage('Invalid priority'),
  body('status')
    .optional()
    .isIn(TEMPLATE_STATUSES)
    .withMessage('Invalid status'),
  body('estimatedTime')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Estimated time must be a positive number'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('isShared')
    .optional()
    .isBoolean()
    .withMessage('isShared must be a boolean'),
];

const updateTemplateValidator = [
  body('title')
    .optional()
    .isString()
    .withMessage('Title must be a string')
    .trim()
    .notEmpty()
    .withMessage('Title cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Title cannot exceed 100 characters'),
  body('description')
    .optional()
    .isString()
    .withMessage('Description must be a string')
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description cannot exceed 5000 characters'),
  body('category')
    .optional()
    .isString()
    .withMessage('Category must be a string')
    .trim()
    .isLength({ max: 100 })
    .withMessage('Category cannot exceed 100 characters'),
  body('priority')
    .optional()
    .isIn(TEMPLATE_PRIORITIES)
    .withMessage('Invalid priority'),
  body('status')
    .optional()
    .isIn(TEMPLATE_STATUSES)
    .withMessage('Invalid status'),
  body('estimatedTime')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Estimated time must be a positive number'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('isShared')
    .optional()
    .isBoolean()
    .withMessage('isShared must be a boolean'),
];

module.exports = {
  templateIdValidator,
  createTemplateValidator,
  updateTemplateValidator,
};
