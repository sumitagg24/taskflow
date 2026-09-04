const User = require('../models/User');
const Notification = require('../models/Notification');
const { getIO } = require('./socketService');
const emailService = require('./emailService');
const logger = require('../utils/logger');

// Single producer for all notifications. Checks the user's in-app preference,
// persists the notification, pushes it over the user's socket room, and sends
// a best-effort email when the user has email enabled and a transport exists.
// Never throws to the caller — failures are logged and swallowed so producers
// (request handlers, the scheduler) are never blocked by a notification issue.
async function notifyUser({
  userId,
  type = 'system',
  title,
  message,
  relatedId = null,
  relatedType = 'system',
  metadata = {},
}) {
  if (!userId || !title || !message) return null;

  try {
    const user = await User.findById(userId).select('preferences email name');
    if (!user || user.preferences?.notifications === false) return null;

    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      relatedId,
      relatedType,
      metadata,
    });

    // Real-time push — no-op when socket.io is not initialized (e.g. tests).
    try {
      getIO().to(`user:${userId}`).emit('notification:new', notification);
    } catch {
      // socket.io not initialized — skip live push, notification is persisted.
    }

    // Best-effort email, never awaited by the caller.
    if (user.preferences?.emailNotifications && emailService.isConfigured()) {
      emailService
        .sendNotificationEmail(user.email, user.name, notification)
        .catch((err) => logger.warn('Notification email failed:', err.message));
    }

    return notification;
  } catch (err) {
    logger.error('Failed to create notification:', err.message);
    return null;
  }
}

module.exports = { notifyUser };