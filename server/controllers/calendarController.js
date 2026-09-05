const Task = require('../models/Task');
const mongoose = require('mongoose');
const { getCalendarDownloadInfo, getGoogleCalendarUrl, getOutlookCalendarUrl, getAppleCalendarUrl } = require('../services/icalService');

// -------------------- Export Tasks as ICS --------------------
exports.exportCalendar = async (req, res, next) => {
  try {
    const { status, priority, category, tag } = req.query;
    const query = { userId: req.user._id };

    const VALID_STATUSES = ['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled'];
    const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low', 'none'];

    // Strict enums: present-but-unlisted values 400 naming the field instead
    // of silently returning the unfiltered calendar. Absent keeps the default.
    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid status filter: must be one of backlog, pending, in-progress, completed, blocked, review, cancelled' });
    }
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ message: 'Invalid priority filter: must be one of critical, high, medium, low, none' });
    }

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category && typeof category === 'string') query.category = category;
    if (tag && typeof tag === 'string') query.tags = tag;

    const tasks = await Task.find(query)
      .sort({ dueDate: 1, createdAt: -1 })
      .select('title description status category priority dueDate createdAt updatedAt tags assignee');

    const downloadInfo = getCalendarDownloadInfo(tasks, req.user);

    res.setHeader('Content-Type', downloadInfo.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadInfo.filename}"`);
    res.send(downloadInfo.content);
  } catch (error) {
    next(error);
  }
};

// -------------------- Get Calendar Links --------------------
exports.getCalendarLinks = async (req, res, next) => {
  try {
    const { taskId } = req.query;

    if (!taskId) {
      return res.status(400).json({ message: 'taskId is required' });
    }

    if (typeof taskId !== 'string' || !mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ message: 'Invalid taskId: must be a task ID' });
    }

    const task = await Task.findOne({ _id: taskId, userId: req.user._id })
      .select('title description category priority dueDate');

    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    res.json({
      google: getGoogleCalendarUrl(task),
      outlook: getOutlookCalendarUrl(task),
      apple: getAppleCalendarUrl(task),
    });
  } catch (error) {
    next(error);
  }
};
