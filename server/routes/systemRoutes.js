const express = require('express');
const router = express.Router();
const { getSystemHealth } = require('../controllers/systemController');
const { getEmailStatus, isConfigured } = require('../services/emailService');

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

router.post('/email-test', async (req, res) => {
  const { to } = req.body;
  if (!to) {
    return res.status(400).json({ message: 'Missing "to" email address in request body' });
  }

  try {
    const emailService = require('../services/emailService');
    const result = await emailService.sendEmail(to, 'TaskFlow Test Email', '<p>This is a test email from TaskFlow.</p>');
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
