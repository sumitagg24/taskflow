const mongoose = require('mongoose');

const timeSessionSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    
    start: { type: Date, required: true },
    end: Date,
    duration: Number, // in minutes
    
    notes: { type: String, maxlength: 1000 },
    tags: [{ type: String, trim: true }],
    
    // Metadata
    isPaused: { type: Boolean, default: false },
    pausedAt: Date,
    pauseDurations: [{ type: Number, default: 0 }], // durations of pauses in minutes
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
timeSessionSchema.index({ userId: 1, start: -1 });
timeSessionSchema.index({ taskId: 1, userId: 1 });
timeSessionSchema.index({ userId: 1, start: 1, end: 1 });

module.exports = mongoose.model('TimeSession', timeSessionSchema);
