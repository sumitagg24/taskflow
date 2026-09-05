'use strict';

// Strict input chains for calendar routes. status/priority enum filters 400 on
// unknown values (absent keeps the unfiltered default); the links ?taskId=
// must be a MongoId so a malformed value 400s instead of surfacing a CastError.
const { query } = require('express-validator');

const CALENDAR_STATUSES = ['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled'];
const CALENDAR_PRIORITIES = ['critical', 'high', 'medium', 'low', 'none'];

const calendarExportValidator = [
  query('status')
    .optional()
    .isIn(CALENDAR_STATUSES)
    .withMessage('Invalid status filter: must be one of backlog, pending, in-progress, completed, blocked, review, cancelled'),
  query('priority')
    .optional()
    .isIn(CALENDAR_PRIORITIES)
    .withMessage('Invalid priority filter: must be one of critical, high, medium, low, none'),
];

const calendarLinksValidator = [
  query('taskId')
    .notEmpty()
    .withMessage('taskId is required')
    .isMongoId()
    .withMessage('Invalid taskId: must be a task ID'),
];

module.exports = {
  calendarExportValidator,
  calendarLinksValidator,
};
