const express = require('express');

const router = express.Router();
const {
  getToday,
  createInboxTask,
  getInbox,
  triageInbox,
  setTopThree,
  reorderToday,
  resolveDay,
  getWeeklyReview,
  dismissWeekly,
} = require('../controllers/dailyController');
const { protect } = require('../middleware/auth');

// All daily-loop routes require auth (same as /api/tasks).
router.use(protect);

// Today + reorder + Top Three
router.get('/today', getToday);
router.put('/top-three', setTopThree);
router.post('/reorder', reorderToday);
router.post('/resolve', resolveDay);

// Inbox quick-capture + triage
router.get('/inbox', getInbox);
router.post('/inbox', createInboxTask);
router.post('/triage', triageInbox);

// Weekly reset (optional, dismissible, no gamification)
router.get('/weekly-review', getWeeklyReview);
router.post('/weekly-dismiss', dismissWeekly);

module.exports = router;
