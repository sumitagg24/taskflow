'use strict';

// Strict input chains for time-tracking routes, which previously had no
// validation. Every :taskId must be a MongoId; notes are optional strings
// capped at the TimeSession schema maxlength (1000); history/report query
// filters reject non-conforming values instead of silently ignoring them.
const { body, param, query } = require('express-validator');

const REPORT_PERIODS = ['week', 'month', 'year'];

const taskIdParamValidator = [
  param('taskId').isMongoId().withMessage('Invalid task ID'),
];

const notesBodyValidator = body('notes')
  .optional()
  .isString()
  .withMessage('Notes must be a string')
  .trim()
  .isLength({ max: 1000 })
  .withMessage('Notes cannot exceed 1000 characters');

const startTimerValidator = [...taskIdParamValidator, notesBodyValidator];

const pauseTimerValidator = [...taskIdParamValidator, notesBodyValidator];

const timerHistoryValidator = [
  query('taskId')
    .optional()
    .isMongoId()
    .withMessage('Invalid taskId filter: must be a task ID'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid startDate filter: must be a valid date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid endDate filter: must be a valid date'),
];

const timeReportValidator = [
  query('period')
    .optional()
    .isIn(REPORT_PERIODS)
    .withMessage('Invalid period filter: must be one of week, month, year'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid startDate filter: must be a valid date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid endDate filter: must be a valid date'),
];

const timeExportValidator = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid startDate filter: must be a valid date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid endDate filter: must be a valid date'),
];

module.exports = {
  REPORT_PERIODS,
  taskIdParamValidator,
  startTimerValidator,
  pauseTimerValidator,
  timerHistoryValidator,
  timeReportValidator,
  timeExportValidator,
};
