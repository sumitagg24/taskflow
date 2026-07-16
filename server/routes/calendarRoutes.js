const express = require('express');
const router = express.Router();
const { exportCalendar, getCalendarLinks } = require('../controllers/calendarController');
const { protect } = require('../middleware/auth');

// All routes require auth
router.use(protect);

// Export calendar
router.get('/export', exportCalendar);

// Get calendar links for task
router.get('/links', getCalendarLinks);

module.exports = router;
