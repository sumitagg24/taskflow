const express = require('express');
const router = express.Router();
const {
  parseTask, breakdownTask, suggestPriorities,
  generateDigest, chat, generateTitle, suggestNextAction,
} = require('../controllers/aiController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.post('/parse', parseTask);
router.post('/breakdown/:id', breakdownTask);
router.post('/suggest-priorities', suggestPriorities);
router.get('/digest', generateDigest);
router.post('/chat', chat);
router.post('/generate-title', generateTitle);
router.get('/suggest-next-action', suggestNextAction);

module.exports = router;
