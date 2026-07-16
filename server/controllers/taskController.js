const Task = require('../models/Task');
const ActivityLog = require('../models/ActivityLog');
const { validationResult } = require('express-validator');
const logger = require('../utils/logger');

const ALLOWED_TASK_FIELDS = new Set([
  'title', 'description', 'status', 'priority', 'dueDate', 'category',
  'tags', 'isFavorite', 'estimatedTime', 'assignee', 'isRecurring',
  'recurringInterval', 'recurringEndDate',
]);

const ALLOWED_BATCH_FIELDS = new Set([
  'status', 'priority', 'category', 'isFavorite', 'dueDate', 'assignee', 'tags',
]);

const ALLOWED_SORT_FIELDS = new Set([
  'dueDate', 'priority', 'title', 'status', 'oldest', 'updated',
]);

const VALID_STATUSES = new Set(['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled']);
const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low', 'none']);

const sanitizeString = (val) => {
  if (typeof val !== 'string') return val;
  return val.replace(/[<>"']/g, '').trim();
};

const validate = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: errors.array().map((e) => e.msg).join(', ') });
    return false;
  }
  return true;
};

const logActivity = async (userId, userName, action, taskId, taskTitle, details, metadata = {}) => {
  try {
    await ActivityLog.create({ userId, userName, action, taskId, taskTitle, details, metadata });
  } catch (err) {
    // Log the error with full context so it can be monitored/alerted on.
    // Do not silently swallow — surface it so ops can detect DB issues.
    logger.error('Failed to log activity', {
      userId,
      action,
      taskId,
      taskTitle,
      details,
      metadata,
      error: err.message,
      code: err.code,
    });
  }
};

// Get all tasks for current user with filters
exports.getTasks = async (req, res, next) => {
  try {
    const { status, priority, sort, search, category, tag, isFavorite, dueDateBefore, dueDateAfter } = req.query;
    const filter = { userId: req.user._id };

    if (status && VALID_STATUSES.has(status)) filter.status = status;
    if (priority && VALID_PRIORITIES.has(priority)) filter.priority = priority;
    if (category) filter.category = sanitizeString(category);
    if (tag) filter.tags = { $in: [sanitizeString(tag)] };
    if (isFavorite === 'true') filter.isFavorite = true;
    if (dueDateBefore) filter.dueDate = { ...filter.dueDate, $lte: new Date(dueDateBefore) };
    if (dueDateAfter) filter.dueDate = { ...filter.dueDate, $gte: new Date(dueDateAfter) };

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
      ];
    }

    let sortOption = { order: 1, createdAt: -1 };
    if (sort === 'dueDate') sortOption = { dueDate: 1 };
    else if (sort === '-dueDate') sortOption = { dueDate: -1 };
    else if (sort === 'priority') sortOption = { priority: 1 };
    else if (sort === '-priority') sortOption = { priority: -1 };
    else if (sort === 'title') sortOption = { title: 1 };
    else if (sort === '-title') sortOption = { title: -1 };
    else if (sort === 'status') sortOption = { status: 1 };
    else if (sort === 'oldest') sortOption = { createdAt: 1 };
    else if (sort === 'updated') sortOption = { updatedAt: -1 };

    const tasks = await Task.find(filter)
      .sort(sortOption)
      .populate('assignee', 'name email avatar')
      .populate('comments.userId', 'name email avatar');

    res.json(tasks);
  } catch (error) {
    next(error);
  }
};

// Get single task
exports.getTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id })
      .populate('assignee', 'name email avatar')
      .populate('comments.userId', 'name email avatar')
      .populate('dependencies.taskId', 'title status');
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(task);
  } catch (error) {
    next(error);
  }
};

// Create task
exports.createTask = async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const rawTaskData = { ...req.body };
    const taskData = {};
    for (const key of ALLOWED_TASK_FIELDS) {
      if (rawTaskData[key] !== undefined) {
        taskData[key] = rawTaskData[key];
      }
    }
    taskData.userId = req.user._id;

    const task = await Task.create(taskData);

    // Log activity
    await logActivity(
      req.user._id, req.user.name, 'task_created',
      task._id, task.title, 'Task created'
    );

    // Handle recurring task setup
    if (task.isRecurring && task.recurringInterval) {
      const nextDate = calculateNextRecurringDate(task.recurringInterval, task.dueDate || new Date());
      task.recurringNextDate = nextDate;
      await task.save();
    }

    const populated = await Task.findById(task._id)
      .populate('assignee', 'name email avatar');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user._id}`).emit('task:created', populated);
    }

    res.status(201).json(populated);
  } catch (error) {
    next(error);
  }
};

// Update task
exports.updateTask = async (req, res, next) => {
  try {
    if (!validate(req, res)) return;

    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const changes = [];
    const oldStatus = task.status;
    const oldPriority = task.priority;

    // Track changes for activity log
    if (req.body.title && req.body.title !== task.title) changes.push('title');
    if (req.body.description !== undefined && req.body.description !== task.description) changes.push('description');
    if (req.body.status && req.body.status !== task.status) {
      changes.push(`status from "${task.status}" to "${req.body.status}"`);
      if (req.body.status === 'completed') {
        req.body.completedAt = new Date();
      }
    }
    if (req.body.priority && req.body.priority !== task.priority) changes.push('priority');
    if (req.body.dueDate !== undefined && req.body.dueDate !== (task.dueDate ? task.dueDate.toISOString() : null)) {
      changes.push('due date');
    }
    if (req.body.category && req.body.category !== task.category) changes.push('category');
    if (req.body.assignee !== undefined && req.body.assignee !== (task.assignee ? task.assignee.toString() : null)) {
      changes.push('assignee');
    }

    const allowedUpdates = {};
    for (const key of ALLOWED_TASK_FIELDS) {
      if (req.body[key] !== undefined) {
        allowedUpdates[key] = req.body[key];
      }
    }

    Object.assign(task, allowedUpdates);
    await task.save();

    // Log activity
    if (changes.length > 0) {
      const action = changes.some(c => c.includes('completed')) ? 'task_completed' :
                     changes.some(c => c.includes('status')) ? 'task_status_changed' :
                     changes.some(c => c.includes('priority')) ? 'task_priority_changed' : 'task_updated';
      await logActivity(
        req.user._id, req.user.name, action,
        task._id, task.title, `Updated: ${changes.join(', ')}`
      );
    }

    const populated = await Task.findById(task._id)
      .populate('assignee', 'name email avatar')
      .populate('comments.userId', 'name email avatar');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user._id}`).emit('task:updated', populated);
    }

    res.json(populated);
  } catch (error) {
    next(error);
  }
};

// Delete task
exports.deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    await logActivity(
      req.user._id, req.user.name, 'task_deleted',
      task._id, task.title, 'Task deleted'
    );

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user._id}`).emit('task:deleted', { _id: task._id });
    }

    res.json({ message: 'Task deleted successfully', _id: task._id });
  } catch (error) {
    next(error);
  }
};

// ========== Subtask operations ==========
exports.addSubtask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const subtask = { title: req.body.title, completed: false, order: task.subtasks.length };
    task.subtasks.push(subtask);
    await task.save();

    await logActivity(req.user._id, req.user.name, 'subtask_added', task._id, task.title, `Subtask added: "${req.body.title}"`);

    const io = req.app.get('io');
    if (io) io.to(`user:${req.user._id}`).emit('task:updated', task);

    res.json(task);
  } catch (error) {
    next(error);
  }
};

exports.updateSubtask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const subtask = task.subtasks.id(req.params.subtaskId);
    if (!subtask) return res.status(404).json({ message: 'Subtask not found' });

    if (req.body.title !== undefined) subtask.title = req.body.title;
    if (req.body.completed !== undefined) {
      subtask.completed = req.body.completed;
      if (req.body.completed) {
        await logActivity(req.user._id, req.user.name, 'subtask_completed', task._id, task.title, `Subtask completed: "${subtask.title}"`);
      }
    }

    await task.save();

    const io = req.app.get('io');
    if (io) io.to(`user:${req.user._id}`).emit('task:updated', task);

    res.json(task);
  } catch (error) {
    next(error);
  }
};

exports.deleteSubtask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    task.subtasks.pull({ _id: req.params.subtaskId });
    await task.save();

    const io = req.app.get('io');
    if (io) io.to(`user:${req.user._id}`).emit('task:updated', task);

    res.json(task);
  } catch (error) {
    next(error);
  }
};

// ========== Comment operations ==========
exports.addComment = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const comment = {
      userId: req.user._id,
      text: req.body.text,
    };
    if (comment.text && comment.text.length > 2000) {
      return res.status(400).json({ message: 'Comment text cannot exceed 2000 characters' });
    }
    task.comments.push(comment);
    await task.save();

    await logActivity(req.user._id, req.user.name, 'comment_added', task._id, task.title, 'Comment added');

    const io = req.app.get('io');
    if (io) io.to(`user:${req.user._id}`).emit('task:updated', task);

    const populated = await Task.findById(task._id)
      .populate('comments.userId', 'name email avatar');

    res.json(populated);
  } catch (error) {
    next(error);
  }
};

exports.deleteComment = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    task.comments.pull({ _id: req.params.commentId });
    await task.save();

    const io = req.app.get('io');
    if (io) io.to(`user:${req.user._id}`).emit('task:updated', task);

    res.json(task);
  } catch (error) {
    next(error);
  }
};

// ========== Time tracking ==========
exports.startTimer = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    task.timeSessions.push({ start: new Date() });
    await task.save();

    res.json(task);
  } catch (error) {
    next(error);
  }
};

exports.stopTimer = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    const openSession = task.timeSessions.find(s => !s.end);
    if (!openSession) return res.status(400).json({ message: 'No active timer' });

    openSession.end = new Date();
    openSession.duration = Math.round((openSession.end - openSession.start) / 60000); // minutes
    task.timeSpent += openSession.duration;
    await task.save();

    res.json(task);
  } catch (error) {
    next(error);
  }
};

// ========== Toggle favorite ==========
exports.toggleFavorite = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    task.isFavorite = !task.isFavorite;
    await task.save();

    res.json(task);
  } catch (error) {
    next(error);
  }
};

// ========== Update order (for drag-and-drop) ==========
exports.updateOrder = async (req, res, next) => {
  try {
    const { orders } = req.body; // [{ _id, order, status }]
    if (!Array.isArray(orders)) {
      return res.status(400).json({ message: 'orders must be an array' });
    }

    const bulkOps = orders.map((o) => ({
      updateOne: {
        filter: { _id: o._id, userId: req.user._id },
        update: { $set: { order: o.order, status: o.status } },
      },
    }));

    await Task.bulkWrite(bulkOps);
    res.json({ message: 'Orders updated' });
  } catch (error) {
    next(error);
  }
};

// ========== Batch operations ==========
exports.batchUpdate = async (req, res, next) => {
  try {
    const { taskIds, updates } = req.body;
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ message: 'taskIds must be a non-empty array' });
    }

    const safeUpdates = {};
    for (const key of ALLOWED_BATCH_FIELDS) {
      if (updates[key] !== undefined) {
        safeUpdates[key] = updates[key];
      }
    }

    await Task.updateMany(
      { _id: { $in: taskIds }, userId: req.user._id },
      { $set: safeUpdates }
    );

    const updated = await Task.find({ _id: { $in: taskIds }, userId: req.user._id });
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

// ========== Get stats ==========
exports.getStats = async (req, res, next) => {
  try {
    const [total, byStatus, byPriority, byCategory, overdue] = await Promise.all([
      Task.countDocuments({ userId: req.user._id }),
      Task.aggregate([
        { $match: { userId: req.user._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { userId: req.user._id } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { userId: req.user._id } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      Task.countDocuments({
        userId: req.user._id,
        dueDate: { $lte: new Date() },
        status: { $nin: ['completed', 'cancelled'] },
      }),
    ]);

    const completedToday = await Task.countDocuments({
      userId: req.user._id,
      completedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    });

    res.json({
      total,
      byStatus,
      byPriority,
      byCategory,
      overdue,
      completedToday,
    });
  } catch (error) {
    next(error);
  }
};

// ========== Get activity log ==========
exports.getActivityLog = async (req, res, next) => {
  try {
    const activities = await ActivityLog.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json(activities);
  } catch (error) {
    next(error);
  }
};

// ========== Export tasks ==========
exports.exportTasks = async (req, res, next) => {
  try {
    const { format = 'json' } = req.query;
    const tasks = await Task.find({ userId: req.user._id })
      .populate('assignee', 'name email')
      .lean();

    if (format === 'csv') {
      const escapeCsv = (val) => {
        const str = String(val ?? '');
        // Block formula-injection prefixes and characters that break CSV structure
        if (
          str.includes('"') ||
          str.includes(',') ||
          str.includes('\n') ||
          str.includes('\r') ||
          str.startsWith('=') ||
          str.startsWith('+') ||
          str.startsWith('-') ||
          str.startsWith('@') ||
          str.startsWith('\t') ||
          str.startsWith('http') ||
          str.startsWith('HTTP')
        ) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      const headers = ['title','description','status','priority','dueDate','category','tags','isFavorite','estimatedTime','timeSpent','createdAt','updatedAt'];
      const rows = tasks.map(t => [
        escapeCsv(t.title || ''),
        escapeCsv(t.description || ''),
        t.status,
        t.priority,
        t.dueDate ? new Date(t.dueDate).toISOString() : '',
        t.category || '',
        escapeCsv((t.tags || []).join('; ')),
        t.isFavorite ? 'Yes' : 'No',
        t.estimatedTime || 0,
        t.timeSpent || 0,
        new Date(t.createdAt).toISOString(),
        new Date(t.updatedAt).toISOString(),
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=tasks-export.csv');
      return res.send(csv);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=tasks-export.json');
    res.json(tasks);
  } catch (error) {
    next(error);
  }
};

// ========== Update recurring tasks (called by cron) ==========
exports.processRecurringTasks = async () => {
  try {
    const now = new Date();
    const tasks = await Task.find({
      isRecurring: true,
      recurringNextDate: { $lte: now },
      status: { $in: ['completed', 'cancelled'] },
    });

    for (const task of tasks) {
      if (task.recurringEndDate && task.recurringNextDate > task.recurringEndDate) {
        continue;
      }

      const nextRecurrence = calculateNextRecurringDate(task.recurringInterval, task.recurringNextDate);
      
      const newTask = new Task({
        ...task.toObject(),
        _id: undefined,
        createdAt: undefined,
        updatedAt: undefined,
        status: 'pending',
        completedAt: null,
        subtasks: task.subtasks.map(s => ({ ...s, completed: false })),
        comments: [],
        attachments: [],
        timeSessions: [],
        timeSpent: 0,
        activityLog: [],
        isFavorite: false,
        dueDate: task.recurringNextDate,
        recurringNextDate: nextRecurrence,
      });
      await newTask.save();

      task.recurringNextDate = nextRecurrence;
      await task.save();
    }
  } catch (err) {
    logger.error('Failed to process recurring tasks:', err.message);
  }
};

function calculateNextRecurringDate(interval, fromDate) {
  const date = new Date(fromDate || new Date());
  switch (interval) {
    case 'daily': date.setDate(date.getDate() + 1); break;
    case 'weekdays':
      date.setDate(date.getDate() + 1);
      while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
      break;
    case 'weekly': date.setDate(date.getDate() + 7); break;
    case 'monthly': date.setMonth(date.getMonth() + 1); break;
    case 'yearly': date.setFullYear(date.getFullYear() + 1); break;
  }
  return date;
}
