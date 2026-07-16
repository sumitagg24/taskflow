const mongoose = require('mongoose');

const subtaskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  completed: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
}, { timestamps: true });

const templateSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
      default: '',
    },
    category: { type: String, default: 'uncategorized' },
    priority: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low', 'none'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled'],
      default: 'pending',
    },
    estimatedTime: { type: Number, default: 0 }, // minutes

    // Subtasks
    subtasks: [subtaskSchema],

    // Tags
    tags: [{ type: String, trim: true }],

    // Owner
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isShared: { type: Boolean, default: false },
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Usage stats
    usageCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

templateSchema.index({ userId: 1 });
templateSchema.index({ userId: 1, category: 1 });
templateSchema.index({ tags: 1 });

module.exports = mongoose.model('TaskTemplate', templateSchema);
