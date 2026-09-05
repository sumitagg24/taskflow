const express = require('express');
const router = express.Router();
const {
  startTimer,
  stopTimer,
  pauseTimer,
  resumeTimer,
  getActiveTimer,
  getTimerHistory,
  exportTimeTracking,
  getTimeReport,
} = require('../controllers/timeTrackingController');
const { protect } = require('../middleware/auth');
const {
  taskIdParamValidator,
  startTimerValidator,
  pauseTimerValidator,
  timerHistoryValidator,
  timeReportValidator,
  timeExportValidator,
} = require('../validators/timeTrackingValidators');
const validate = require('../validators/validate');

// All routes require auth
router.use(protect);

// History and reports (must be declared before /:taskId)
router.get('/history', timerHistoryValidator, validate, getTimerHistory);
router.get('/export', timeExportValidator, validate, exportTimeTracking);
router.get('/report', timeReportValidator, validate, getTimeReport);

// Timer control for specific task
router.post('/:taskId/start', startTimerValidator, validate, startTimer);
router.post('/:taskId/stop', taskIdParamValidator, validate, stopTimer);
router.post('/:taskId/pause', pauseTimerValidator, validate, pauseTimer);
router.post('/:taskId/resume', taskIdParamValidator, validate, resumeTimer);
router.get('/:taskId', taskIdParamValidator, validate, getActiveTimer);

module.exports = router;
