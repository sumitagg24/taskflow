const { body, param, query } = require('express-validator');

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

// Strict enum filters for GET /api/tasks. Absent params keep the unfiltered
// default; present-but-unlisted values 400 (naming the bad field) instead of
// being silently ignored. Mirrored by manual guards in getTasks so the 400
// holds even if the chain is ever unwired.
const TASK_STATUSES = ['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled'];
const TASK_PRIORITIES = ['critical', 'high', 'medium', 'low', 'none'];
const TASK_SORTS = ['dueDate', '-dueDate', 'priority', '-priority', 'title', '-title', 'status', 'oldest', 'updated'];

const listQueryValidator = [
  query('status')
    .optional()
    .isIn(TASK_STATUSES)
    .withMessage('Invalid status filter: must be one of backlog, pending, in-progress, completed, blocked, review, cancelled'),
  query('priority')
    .optional()
    .isIn(TASK_PRIORITIES)
    .withMessage('Invalid priority filter: must be one of critical, high, medium, low, none'),
  query('sort')
    .optional()
    .isIn(TASK_SORTS)
    .withMessage('Invalid sort option: must be one of dueDate, -dueDate, priority, -priority, title, -title, status, oldest, updated'),
];

const exportQueryValidator = [
  query('format')
    .optional()
    .isIn(['json', 'csv'])
    .withMessage('Invalid format: must be one of json, csv'),
];

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
  listQueryValidator,
  exportQueryValidator,
};
