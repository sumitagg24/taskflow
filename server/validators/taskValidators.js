const { body, param } = require('express-validator');

const createTaskValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description cannot exceed 5000 characters'),
  body('status')
    .optional()
    .isIn(['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled'])
    .withMessage('Invalid status'),
  body('priority')
    .optional()
    .isIn(['critical', 'high', 'medium', 'low', 'none'])
    .withMessage('Invalid priority'),
  body('dueDate')
    .optional({ values: 'null' })
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('category')
    .optional()
    .trim(),
  body('isRecurring')
    .optional()
    .isBoolean()
    .withMessage('isRecurring must be a boolean'),
  body('recurringInterval')
    .optional()
    .isIn(['daily', 'weekly', 'monthly', 'yearly', 'weekdays'])
    .withMessage('Invalid recurring interval'),
  body('estimatedTime')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Estimated time must be a positive number'),
];

const updateTaskValidator = [
  body('title')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Title cannot be empty')
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Description cannot exceed 5000 characters'),
  body('status')
    .optional()
    .isIn(['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled'])
    .withMessage('Invalid status'),
  body('priority')
    .optional()
    .isIn(['critical', 'high', 'medium', 'low', 'none'])
    .withMessage('Invalid priority'),
  body('dueDate')
    .optional({ values: 'null' })
    .isISO8601()
    .withMessage('Due date must be a valid date'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('category')
    .optional()
    .trim(),
  body('isRecurring')
    .optional()
    .isBoolean(),
  body('recurringInterval')
    .optional()
    .isIn(['daily', 'weekly', 'monthly', 'yearly', 'weekdays']),
  body('estimatedTime')
    .optional()
    .isInt({ min: 0 }),
  body('assignee')
    .optional({ values: 'null' })
    .isMongoId()
    .withMessage('Invalid assignee ID'),
];

const idValidator = [param('id').isMongoId().withMessage('Invalid task ID')];

// Used by /:id/subtasks/:subtaskId and /:id/comments/:commentId
const subtaskIdValidator = [
  param('id').isMongoId().withMessage('Invalid task ID'),
  param('subtaskId').isMongoId().withMessage('Invalid subtask ID'),
];

const commentIdValidator = [
  param('id').isMongoId().withMessage('Invalid task ID'),
  param('commentId').isMongoId().withMessage('Invalid comment ID'),
];

module.exports = {
  createTaskValidator,
  updateTaskValidator,
  idValidator,
  subtaskIdValidator,
  commentIdValidator,
};
