const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');
const { param } = require('express-validator');

const idValidator = [param('id').isMongoId().withMessage('Invalid notification ID')];

// All routes require auth.
router.use(protect);

router.get('/', getNotifications);
router.put('/read-all', markAllNotificationsRead);
router.put('/:id/read', idValidator, markNotificationRead);
router.delete('/:id', idValidator, deleteNotification);

module.exports = router;
