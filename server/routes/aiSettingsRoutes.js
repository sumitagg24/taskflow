'use strict';

const express = require('express');
const router = express.Router();
const {
  getAiSettings,
  updateAiSettings,
  testAiConnection,
  removeAiSettings,
} = require('../controllers/aiSettingsController');
const { protect } = require('../middleware/auth');
const { aiTestLimiter } = require('../middleware/rateLimiter');

router.use(protect);

router.get('/', getAiSettings);
router.put('/', updateAiSettings);
router.delete('/', removeAiSettings);
// Tighter limit because the test makes an outbound HTTPS call to the provider.
router.post('/test', aiTestLimiter, testAiConnection);

module.exports = router;
