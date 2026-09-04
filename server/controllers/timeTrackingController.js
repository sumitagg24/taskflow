const Task = require('../models/Task');
const TimeSession = require('../models/TimeSession');

// -------------------- Start Timer --------------------
// Helper: load a task and verify it belongs to the caller. Returns the task
// or sends the appropriate error response and returns null.
const loadOwnedTask = async (taskId, userId, res) => {
  const task = await Task.findById(taskId);
  if (!task) {
    res.status(404).json({ message: 'Task not found' });
    return null;
  }
  if (task.userId.toString() !== userId.toString()) {
    // Return 404 (not 403) to avoid leaking the existence of tasks owned by others.
    res.status(404).json({ message: 'Task not found' });
    return null;
  }
  return task;
};

exports.startTimer = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { notes } = req.body;

    const task = await loadOwnedTask(taskId, req.user._id, res);
    if (!task) return;

    // Check if there's already an active timer for this task
    const activeSession = await TimeSession.findOne({
      taskId,
      userId: req.user._id,
      end: { $exists: false },
    });

    if (activeSession) {
      return res.status(400).json({ message: 'Timer is already running for this task' });
    }

    const session = await TimeSession.create({
      taskId,
      userId: req.user._id,
      start: new Date(),
      notes: notes || '',
    });

    res.status(201).json({ session });
  } catch (error) {
    next(error);
  }
};

// -------------------- Stop Timer --------------------
exports.stopTimer = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const task = await loadOwnedTask(taskId, req.user._id, res);
    if (!task) return;

    const session = await TimeSession.findOne({
      taskId,
      userId: req.user._id,
      end: { $exists: false },
    });

    if (!session) {
      return res.status(404).json({ message: 'No active timer found for this task' });
    }

    const now = new Date();
    const durationMinutes = Math.round((now.getTime() - session.start.getTime()) / 60000);

    session.end = now;
    session.duration = durationMinutes;
    await session.save();

    // Update task time spent
    await Task.findByIdAndUpdate(taskId, {
      $inc: { timeSpent: durationMinutes },
    });

    res.json({ session, duration: durationMinutes });
  } catch (error) {
    next(error);
  }
};

// -------------------- Pause Timer --------------------
exports.pauseTimer = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const task = await loadOwnedTask(taskId, req.user._id, res);
    if (!task) return;

    const session = await TimeSession.findOne({
      taskId,
      userId: req.user._id,
      end: { $exists: false },
    });

    if (!session) {
      return res.status(404).json({ message: 'No active timer found for this task' });
    }

    if (session.isPaused) {
      return res.status(400).json({ message: 'Timer is already paused' });
    }

    const now = new Date();
    const timeSoFar = Math.round((now.getTime() - session.start.getTime()) / 60000);

    session.isPaused = true;
    session.pausedAt = now;
    // Record pause start time; duration is calculated in resumeTimer.
    // Use null as the placeholder until resumed, so we can distinguish
    // a not-yet-resumed pause from a zero-second pause.
    session.pauseDurations = [...(session.pauseDurations || []), null];
    await session.save();

    res.json({ session, timeSoFar });
  } catch (error) {
    next(error);
  }
};

// -------------------- Resume Timer --------------------
exports.resumeTimer = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const task = await loadOwnedTask(taskId, req.user._id, res);
    if (!task) return;

    const session = await TimeSession.findOne({
      taskId,
      userId: req.user._id,
      end: { $exists: false },
    });

    if (!session) {
      return res.status(404).json({ message: 'No active timer found for this task' });
    }

    if (!session.isPaused) {
      return res.status(400).json({ message: 'Timer is not paused' });
    }

    const now = new Date();
    const pauseDurationMs = now.getTime() - session.pausedAt.getTime();
    const pauseDurationMinutes = Math.round(pauseDurationMs / 60000);

    session.isPaused = false;
    session.pausedAt = null;
    session.pauseDurations[session.pauseDurations.length - 1] = pauseDurationMinutes;
    await session.save();

    res.json({ session, pauseDuration });
  } catch (error) {
    next(error);
  }
};

// -------------------- Get Active Timer --------------------
exports.getActiveTimer = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const task = await loadOwnedTask(taskId, req.user._id, res);
    if (!task) return;

    const session = await TimeSession.findOne({
      taskId,
      userId: req.user._id,
      end: { $exists: false },
    }).populate('taskId', 'title');

    if (!session) {
      return res.json({ active: false, session: null });
    }

    const now = new Date();
    const timeSoFar = Math.round((now.getTime() - session.start.getTime()) / 60000);

    res.json({ active: true, session, timeSoFar });
  } catch (error) {
    next(error);
  }
};

// -------------------- Get Timer History --------------------
exports.getTimerHistory = async (req, res, next) => {
  try {
    const { taskId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const query = { userId: req.user._id };

    if (taskId) query.taskId = taskId;
    if (startDate) query.start = { $gte: new Date(startDate) };
    if (endDate) {
      query.start = query.start || {};
      query.start.$lte = new Date(endDate);
    }

    const sessions = await TimeSession.find(query)
      .sort({ start: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('taskId', 'title category priority dueDate');

    // Calculate stats
    const stats = await TimeSession.aggregate([
      { $match: { userId: req.user._id } },
      {
        $group: {
          _id: null,
          totalDuration: { $sum: '$duration' },
          sessionCount: { $sum: 1 },
          avgDuration: { $avg: '$duration' },
          longestSession: { $max: '$duration' },
          shortestSession: { $min: '$duration' },
        },
      },
    ]);

    // Calculate daily breakdown
    const dailyStats = await TimeSession.aggregate([
      {
        $match: { 
          userId: req.user._id,
          start: { 
            $gte: new Date(startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
            $lte: new Date(endDate || new Date())
          }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$start' } },
          duration: { $sum: '$duration' },
          sessionCount: { $sum: 1 },
        }
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      sessions,
      stats: stats[0] || { totalDuration: 0, sessionCount: 0, avgDuration: 0, longestSession: 0, shortestSession: 0 },
      dailyStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: await TimeSession.countDocuments(query),
      },
    });
  } catch (error) {
    next(error);
  }
};

// -------------------- Export Time Tracking CSV --------------------
exports.exportTimeTracking = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { userId: req.user._id };

    if (startDate) query.start = { $gte: new Date(startDate) };
    if (endDate) {
      query.start = query.start || {};
      query.start.$lte = new Date(endDate);
    }

    const sessions = await TimeSession.find(query)
      .sort({ start: -1 })
      .populate('taskId', 'title category priority');

    // Generate CSV
    const headers = ['Date', 'Task', 'Category', 'Priority', 'Start Time', 'End Time', 'Duration (min)', 'Notes'];
    const escapeCsv = (val) => {
      const str = String(val ?? '');
      // Block formula-injection prefixes and characters that break CSV structure
      if (
        str.startsWith('=') ||
        str.startsWith('+') ||
        str.startsWith('-') ||
        str.startsWith('@') ||
        str.includes('"') ||
        str.includes(',') ||
        str.includes('\n') ||
        str.includes('\r')
      ) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const rows = sessions.map(s => [
      escapeCsv(s.start.toISOString().split('T')[0]),
      escapeCsv(s.taskId?.title || 'Unknown Task'),
      escapeCsv(s.taskId?.category || ''),
      escapeCsv(s.taskId?.priority || ''),
      escapeCsv(s.start.toISOString()),
      escapeCsv(s.end?.toISOString() || ''),
      escapeCsv(s.duration || ''),
      escapeCsv(s.notes || ''),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const filename = `time-tracking-${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
};

// -------------------- Get Time Report --------------------
exports.getTimeReport = async (req, res, next) => {
  try {
    const { period = 'week', startDate, endDate } = req.query;
    
    let match;
    if (startDate && endDate) {
      match = {
        userId: req.user._id,
        start: { $gte: new Date(startDate), $lte: new Date(endDate) },
      };
    } else if (period === 'week') {
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      match = {
        userId: req.user._id,
        start: { $gte: startOfWeek },
      };
    } else if (period === 'month') {
      const now = new Date();
      match = {
        userId: req.user._id,
        start: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) },
      };
    } else if (period === 'year') {
      const now = new Date();
      match = {
        userId: req.user._id,
        start: { $gte: new Date(now.getFullYear(), 0, 1) },
      };
    } else {
      // last 7 days
      match = {
        userId: req.user._id,
        start: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      };
    }

    const report = await TimeSession.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalDuration: { $sum: '$duration' },
          sessionCount: { $sum: 1 },
          avgDuration: { $avg: '$duration' },
          longestSession: { $max: '$duration' },
          totalPaused: { $sum: { $size: '$pauseDurations' } },
        },
      },
      {
        $project: {
          _id: 0,
          totalDuration: { $round: ['$totalDuration', 2] },
          sessionCount: 1,
          avgDuration: { $round: ['$avgDuration', 2] },
          longestSession: 1,
          totalPaused: 1,
        },
      },
    ]);

    res.json({
      period,
      startDate: match.start.$gte.toISOString(),
      endDate: match.start.$lte ? match.start.$lte.toISOString() : null,
      report: report[0] || { totalDuration: 0, sessionCount: 0, avgDuration: 0, longestSession: 0, totalPaused: 0 },
    });
  } catch (error) {
    next(error);
  }
};
