const { validationResult } = require('express-validator');
const { canDeliver, sendContactMessage } = require('../services/emailService');
const logger = require('../utils/logger');

/**
 * POST /api/contact — public contact-support intake.
 *
 * No authentication (logged-out visitors must reach support). Abuse is
 * contained by the contactLimiter (5/hour/IP), tight field caps, and the
 * shared CSRF origin check for cookie-carrying browsers. The destination
 * address is server-side only (SUPPORT_EMAIL); the response never reveals
 * whether delivery is configured beyond a generic availability message.
 */
exports.submitContact = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error(errors.array().map((e) => e.msg).join(', '));
      error.statusCode = 400;
      throw error;
    }

    if (!canDeliver()) {
      return res.status(503).json({
        message: 'Contact support is unavailable right now. Please try again later.',
      });
    }

    const { name, email, subject, message } = req.body;
    await sendContactMessage({ name, email, subject, message });

    // No PII in logs: operators see volume, not contents.
    logger.info('Contact message accepted');
    return res.status(202).json({
      message: 'Thanks — your message is on its way. Our team will get back to you.',
    });
  } catch (error) {
    if (error.statusCode === 503) {
      return res.status(503).json({
        message: 'Contact support is unavailable right now. Please try again later.',
      });
    }
    next(error);
  }
};
