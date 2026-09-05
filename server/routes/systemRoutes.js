const express = require('express');
const router = express.Router();
const { getSystemHealth } = require('../controllers/systemController');
const { getEmailStatus, isConfigured } = require('../services/emailService');
const { protect } = require('../middleware/auth');
const { sanitizeErrorMessage } = require('../middleware/errorHandler');

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const devOnly = (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ message: 'Not found' });
  }
  next();
};

router.use(devOnly);

router.get('/health', getSystemHealth);

router.get('/email-status', (req, res) => {
  res.json({
    ...getEmailStatus(),
  });
});

router.post('/email-test', protect, async (req, res) => {
  const { to } = req.body || {};
  if (!to || typeof to !== 'string' || !EMAIL_RE.test(to.trim())) {
    return res.status(400).json({ message: 'Valid "to" email address is required in request body' });
  }

  try {
    const emailService = require('../services/emailService');
    const result = await emailService.sendEmail(to, 'TaskFlow Test Email', '<p>This is a test email from TaskFlow.</p>');
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: sanitizeErrorMessage(err.message) });
  }
});

module.exports = router;
