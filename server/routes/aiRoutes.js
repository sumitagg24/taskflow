const express = require('express');
const router = express.Router();
const {
  parseTask, breakdownTask, suggestPriorities,
  generateDigest, chat, generateTitle, suggestNextAction,
} = require('../controllers/aiController');
const { protect } = require('../middleware/auth');
const {
  parseTaskValidator,
  breakdownTaskValidator,
  chatValidator,
  generateTitleValidator,
} = require('../validators/aiValidators');
const validate = require('../validators/validate');

router.use(protect);

router.post('/parse', parseTaskValidator, validate, parseTask);
router.post('/breakdown/:id', breakdownTaskValidator, validate, breakdownTask);
router.post('/suggest-priorities', suggestPriorities);
router.get('/digest', generateDigest);
router.post('/chat', chatValidator, validate, chat);
router.post('/generate-title', generateTitleValidator, validate, generateTitle);
router.get('/suggest-next-action', suggestNextAction);

module.exports = router;
