const mongoose = require('mongoose');

const subtaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  completed: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
}, { timestamps: true });

const commentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
});

const attachmentSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  path: String,
  mimeType: String,
  size: Number,
  uploadedAt: { type: Date, default: Date.now },
});

const timeSessionSchema = new mongoose.Schema({
  start: { type: Date, required: true },
  end: Date,
  duration: Number,
});

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
      default: '',
    },
    status: {
      type: String,
      enum: ['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled'],
      default: 'pending',
    },
    priority: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'none'],
      default: 'medium',
    },
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // Auth & ownership
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Subtasks
    subtasks: [subtaskSchema],

    // Comments
    comments: [commentSchema],

    // Tags / Labels
    tags: [{ type: String, trim: true }],

    // Attachments
    attachments: [attachmentSchema],

    // Recurring
    isRecurring: { type: Boolean, default: false },
    recurringInterval: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly', 'weekdays'],
      default: 'weekly',
    },
    recurringNextDate: { type: Date, default: null },
    recurringEndDate: { type: Date, default: null },

    // Dependencies
    dependencies: [{
      taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
      type: { type: String, enum: ['blocks', 'blocked-by'], default: 'blocked-by' },
    }],

    // Time tracking
    estimatedTime: { type: Number, default: 0 }, // minutes
    timeSpent: { type: Number, default: 0 }, // minutes
    timeSessions: [timeSessionSchema],

    // Activity log
    activityLog: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      userName: String,
      action: { type: String, required: true }, // created, updated, status_changed, comment_added, etc.
      details: String,
      createdAt: { type: Date, default: Date.now },
    }],

    // Favorites
    isFavorite: { type: Boolean, default: false },

    // Order for Kanban
    order: { type: Number, default: 0 },

    // Category
    category: { type: String, default: 'uncategorized' },
  },
  {
    timestamps: true,
  }
);

taskSchema.index({ userId: 1, status: 1 });
taskSchema.index({ userId: 1, priority: 1 });
taskSchema.index({ userId: 1, dueDate: 1 });
taskSchema.index({ userId: 1, category: 1 });
taskSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Task', taskSchema);
