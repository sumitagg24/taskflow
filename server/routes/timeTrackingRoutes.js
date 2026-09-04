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

// All routes require auth
router.use(protect);

// History and reports (must be declared before /:taskId)
router.get('/history', getTimerHistory);
router.get('/export', exportTimeTracking);
router.get('/report', getTimeReport);

// Timer control for specific task
router.post('/:taskId/start', startTimer);
router.post('/:taskId/stop', stopTimer);
router.post('/:taskId/pause', pauseTimer);
router.post('/:taskId/resume', resumeTimer);
router.get('/:taskId', getActiveTimer);

module.exports = router;
