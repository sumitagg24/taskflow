const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  action: {
    type: String,
    required: true,
    enum: [
      'task_created', 'task_updated', 'task_deleted', 'task_completed',
      'task_reopened', 'task_status_changed', 'task_priority_changed',
      'comment_added', 'subtask_added', 'subtask_completed',
      'attachment_added', 'task_assigned', 'deadline_changed',
      'category_changed', 'tag_added', 'tag_removed',
      'task_moved', 'user_joined', 'user_left',
    ],
  },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
  taskTitle: { type: String, default: '' },
  details: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ taskId: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
