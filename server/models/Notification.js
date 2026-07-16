const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'task_assigned',
        'task_completed',
        'task_status_changed',
        'task_due_soon',
        'task_overdue',
        'comment_added',
        'mention',
        'due_date_approaching',
        'deadline_reminder',
        'daily_digest',
        'system',
      ],
      default: 'system',
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    // Optional reference to a related resource (task, comment, etc.).
    // Stored as a free-form ObjectId + a string kind so the client can route.
    relatedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    relatedType: {
      type: String,
      enum: ['task', 'comment', 'template', 'system'],
      default: 'system',
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// Compound index used by the common "list my unread first, newest first" query.
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
