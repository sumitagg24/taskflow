const Task = require('../models/Task');
const { getCalendarDownloadInfo, getGoogleCalendarUrl, getOutlookCalendarUrl, getAppleCalendarUrl } = require('../services/icalService');

// -------------------- Export Tasks as ICS --------------------
exports.exportCalendar = async (req, res, next) => {
  try {
    const { status, priority, category, tag } = req.query;
    const query = { userId: req.user._id };

    const VALID_STATUSES = ['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled'];
    const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low', 'none'];

    if (status && VALID_STATUSES.includes(status)) query.status = status;
    if (priority && VALID_PRIORITIES.includes(priority)) query.priority = priority;
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
