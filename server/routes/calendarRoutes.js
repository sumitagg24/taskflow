const express = require('express');
const router = express.Router();
const { exportCalendar, getCalendarLinks } = require('../controllers/calendarController');
const { protect } = require('../middleware/auth');
const {
  calendarExportValidator,
  calendarLinksValidator,
} = require('../validators/calendarValidators');
const validate = require('../validators/validate');

// All routes require auth
router.use(protect);

// Export calendar
router.get('/export', calendarExportValidator, validate, exportCalendar);

// Get calendar links for task
router.get('/links', calendarLinksValidator, validate, getCalendarLinks);

module.exports = router;
