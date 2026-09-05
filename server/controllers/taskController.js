const Task = require('../models/Task');
const ActivityLog = require('../models/ActivityLog');
const User = require('../models/User');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const { notifyUser } = require('../services/notificationService');
const { escapeCsvCell } = require('../utils/csv');
const { enforceTaskLimit } = require('./growthController');
const { getPlan } = require('../config/plans');
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
  'dueDate', '-dueDate', 'priority', '-priority', 'title', '-title',
  'status', 'oldest', 'updated',
]);

const VALID_STATUSES = new Set(['backlog', 'pending', 'in-progress', 'completed', 'blocked', 'review', 'cancelled']);
const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low', 'none']);

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;

// Offset pagination for list endpoints. `?paginate=false` keeps the legacy
// bare-array shape for scripts that predate paging.
const parsePagination = (query) => {
  const paginate = query.paginate !== 'false';
  let page = Number.parseInt(query.page, 10);
  let limit = Number.parseInt(query.limit, 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_PAGE_LIMIT;
  if (limit > MAX_PAGE_LIMIT) limit = MAX_PAGE_LIMIT;
  return { paginate, page, limit };
};
exports.parsePagination = parsePagination;

// List rows never need the heaviest subdocuments: attachments, the embedded
// activity log and time sessions. Comments stay (the board shows the count
// badge); the detail endpoint still returns everything.
const LIST_PROJECTION = '-attachments -activityLog -timeSessions';

// A trashed task is restorable for this long; after that the nightly job purges
// it. Surfaced to the client so the UI can promise the same window.
const TRASH_RETENTION_DAYS = 30;
exports.TRASH_RETENTION_DAYS = TRASH_RETENTION_DAYS;

// Every task query must be scoped to the owner *and* to live (non-trashed)
// rows. Centralising it means a new endpoint can't accidentally serve or mutate
// something the user has already thrown away.
const ownedLive = (userId, extra = {}) => ({ ...extra, userId, deletedAt: null });

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

// `subtasks` and `dependencies` arrive as arrays of subdocuments, so they can't
// ride along in ALLOWED_TASK_FIELDS: each entry has to be reshaped into exactly
// the fields the schema owns, and dependencies additionally have to be proven to
// point at tasks this caller can already see.
const MAX_SUBTASKS = 100;
const MAX_DEPENDENCIES = 25;

const sanitizeSubtasks = (input) => {
  if (!Array.isArray(input)) return null;
  return input
    .filter((s) => s && typeof s.title === 'string' && s.title.trim())
    .slice(0, MAX_SUBTASKS)
    .map((s, i) => ({
      // Keep the _id when the client round-trips an existing subtask, so the
      // per-subtask endpoints still resolve after a whole-form save.
      ...(mongoose.Types.ObjectId.isValid(s._id) ? { _id: s._id } : {}),
      title: s.title.trim().slice(0, 200),
      completed: Boolean(s.completed),
      order: Number.isFinite(Number(s.order)) ? Number(s.order) : i,
    }));
};

const sanitizeDependencies = async (input, userId, selfId) => {
  if (!Array.isArray(input)) return null;

  const wanted = [];
  const seen = new Set();
  for (const dep of input.slice(0, MAX_DEPENDENCIES * 4)) {
    const raw = dep && typeof dep === 'object' ? (dep.taskId?._id ?? dep.taskId) : dep;
    const id = raw == null ? null : String(raw);
    if (!id || !mongoose.Types.ObjectId.isValid(id)) continue;
    if (selfId && id === String(selfId)) continue; // a task cannot depend on itself
    if (seen.has(id)) continue;
    seen.add(id);
    wanted.push({ taskId: id, type: dep?.type === 'blocks' ? 'blocks' : 'blocked-by' });
    if (wanted.length >= MAX_DEPENDENCIES) break;
  }
  if (wanted.length === 0) return [];

  // Only links to the caller's own live tasks survive. `GET /tasks/:id`
  // populates dependency titles, so an unvalidated id would leak the title and
  // status of somebody else's task.
  const owned = await Task.find(
    ownedLive(userId, { _id: { $in: wanted.map((w) => w.taskId) } })
  )
    .select('_id')
    .lean();
  const ownedIds = new Set(owned.map((t) => String(t._id)));
  return wanted.filter((w) => ownedIds.has(w.taskId));
};

// Attachments arrive as file descriptors (from POST /api/upload responses
// the client re-sends here). Reshaped to exactly the fields the schema owns;
// non-array input returns null so the field is left untouched. Capped at a
// generous hard ceiling so a giant payload can't stall the save — the plan
// quota below is what actually admits or rejects.
const MAX_ATTACHMENTS_INPUT = 200;

const sanitizeAttachments = (input) => {
  if (!Array.isArray(input)) return null;
  return input
    .filter((a) => a && typeof a === 'object')
    .slice(0, MAX_ATTACHMENTS_INPUT)
    .map((a) => ({
      filename: String(a.filename || a.originalName || 'file').slice(0, 255),
      originalName: String(a.originalName || a.filename || 'file').slice(0, 255),
      path: String(a.path || '').slice(0, 1024),
      mimeType: String(a.mimeType || '').slice(0, 128),
      size: Number.isFinite(Number(a.size)) ? Math.max(0, Number(a.size)) : 0,
    }));
};

// Plan quota on attachments per task (`attachmentsPerTask` in config/plans.js,
// null = unlimited). `existingCount` is what's already on the task,
// `incomingCount` what's being added now. Returns a `{status, body}` pair to
// send back, or null when within quota.
const enforceAttachmentsLimit = (user, existingCount, incomingCount) => {
  const planId = user.plan || 'free';
  const limit = getPlan(planId).limits.attachmentsPerTask;
  if (limit === null || limit === undefined) return null;
  if (existingCount + incomingCount <= limit) return null;
  return {
    status: 400,
    body: {
      message: `The ${getPlan(planId).name} plan allows up to ${limit} attachments per task. Remove one or upgrade to add more.`,
      limit,
      resource: 'attachments',
    },
  };
};

// Get all tasks for current user with filters
exports.getTasks = async (req, res, next) => {
  try {
    const { status, priority, sort, search, category, tag, isFavorite, dueDateBefore, dueDateAfter } = req.query;
    const filter = ownedLive(req.user._id);

    // Strict enums: a present-but-unlisted value is a client bug, so 400 naming
    // the field instead of silently returning the unfiltered list. Absent
    // params keep the current default. (sanitizeString stays below as
    // defense-in-depth after these checks pass.)
    if (status !== undefined && !VALID_STATUSES.has(status)) {
      return res.status(400).json({ message: 'Invalid status filter: must be one of backlog, pending, in-progress, completed, blocked, review, cancelled' });
    }
    if (priority !== undefined && !VALID_PRIORITIES.has(priority)) {
      return res.status(400).json({ message: 'Invalid priority filter: must be one of critical, high, medium, low, none' });
    }
    if (sort !== undefined && !ALLOWED_SORT_FIELDS.has(sort)) {
      return res.status(400).json({ message: 'Invalid sort option: must be one of dueDate, -dueDate, priority, -priority, title, -title, status, oldest, updated' });
    }

    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category && typeof category === 'string') filter.category = sanitizeString(category);
    if (tag && typeof tag === 'string') filter.tags = { $in: [sanitizeString(tag)] };
    if (isFavorite === 'true') filter.isFavorite = true;
    if (dueDateBefore) {
      const d = new Date(dueDateBefore);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'dueDateBefore must be a valid date' });
      filter.dueDate = { ...filter.dueDate, $lte: d };
    }
    if (dueDateAfter) {
      const d = new Date(dueDateAfter);
      if (isNaN(d.getTime())) return res.status(400).json({ message: 'dueDateAfter must be a valid date' });
      filter.dueDate = { ...filter.dueDate, $gte: d };
    }

    // Full-text first (uses the title/description text index), regex fallback
    // for partial/short queries that stemming would miss. `useText` is tracked
    // so the count query below uses the same predicate that produced the rows.
    let useText = false;
    const rawSearch = typeof search === 'string' ? search.trim() : '';
    if (rawSearch.length >= 2) {
      filter.$text = { $search: rawSearch };
      useText = true;
    } else if (rawSearch) {
      const escaped = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

    const { paginate, page, limit } = parsePagination(req.query);

    const baseQuery = () =>
      Task.find(filter)
        .sort(sortOption)
        .select(LIST_PROJECTION)
        .populate('assignee', 'name email avatar')
        .lean();

    if (!paginate) {
      let tasks = await baseQuery();
      if (useText && tasks.length === 0) {
        const { $text, ...rest } = filter;
        const escaped = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        tasks = await Task.find({
          ...rest,
          $or: [
            { title: { $regex: escaped, $options: 'i' } },
            { description: { $regex: escaped, $options: 'i' } },
          ],
        })
          .sort(sortOption)
          .select(LIST_PROJECTION)
          .populate('assignee', 'name email avatar')
          .lean();
      }
      return res.json(tasks);
    }

    const runPaged = (activeFilter) => Promise.all([
      Task.find(activeFilter)
        .sort(sortOption)
        .select(LIST_PROJECTION)
        .populate('assignee', 'name email avatar')
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Task.countDocuments(activeFilter),
    ]);

    let [tasks, total] = await runPaged(filter);
    if (useText && tasks.length === 0) {
      const { $text, ...rest } = filter;
      const escaped = rawSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const fallback = {
        ...rest,
        $or: [
          { title: { $regex: escaped, $options: 'i' } },
          { description: { $regex: escaped, $options: 'i' } },
        ],
      };
      [tasks, total] = await runPaged(fallback);
    }

    res.json({ data: tasks, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
};

// Get single task
exports.getTask = async (req, res, next) => {
  try {
    const task = await Task.findOne(ownedLive(req.user._id, { _id: req.params.id }))
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

    // Free plans cap live, not-yet-completed tasks. Checked before any write so
    // a blocked create leaves nothing half-made behind.
    const limitHit = await enforceTaskLimit(req.user);
    if (limitHit) return res.status(limitHit.status).json(limitHit.body);

    const rawTaskData = { ...req.body };
    const taskData = {};
    for (const key of ALLOWED_TASK_FIELDS) {
      if (rawTaskData[key] !== undefined) {
        taskData[key] = rawTaskData[key];
      }
    }
    taskData.userId = req.user._id;

    // Subtasks composed in the create form used to be dropped on the floor here,
    // because the whitelist above only copies scalar fields.
    const newSubtasks = sanitizeSubtasks(req.body.subtasks);
    if (newSubtasks) taskData.subtasks = newSubtasks;
    const newDependencies = await sanitizeDependencies(req.body.dependencies, req.user._id);
    if (newDependencies) taskData.dependencies = newDependencies;

    // Attachments quota: a create starts from zero existing.
    const newAttachments = sanitizeAttachments(req.body.attachments);
    if (newAttachments) {
      const over = enforceAttachmentsLimit(req.user, 0, newAttachments.length);
      if (over) return res.status(over.status).json(over.body);
      taskData.attachments = newAttachments;
    }

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
      .populate('assignee', 'name email avatar')
      .populate('dependencies.taskId', 'title status');

    // Notify the assignee when they are someone other than the creator.
    if (task.assignee && task.assignee.toString() !== req.user._id.toString()) {
      await notifyUser({
        userId: task.assignee,
        type: 'task_assigned',
        title: 'New task assigned to you',
        message: `"${task.title}" was assigned to you`,
        relatedId: task._id,
        relatedType: 'task',
        metadata: { status: task.status },
      });
    }

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

    const task = await Task.findOne(ownedLive(req.user._id, { _id: req.params.id }));
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

    // Same story as create: these two are arrays of subdocuments, so they get
    // reshaped rather than copied. Sending `[]` is a legitimate "clear them all".
    const nextSubtasks = sanitizeSubtasks(req.body.subtasks);
    if (nextSubtasks) allowedUpdates.subtasks = nextSubtasks;
    const nextDependencies = await sanitizeDependencies(req.body.dependencies, req.user._id, task._id);
    if (nextDependencies) allowedUpdates.dependencies = nextDependencies;

    // Attachments are appended (each entry is one uploaded file), so the quota
    // counts what's already on the task plus what's being added now. Sending
    // `[]` is a no-op; omitting the field leaves attachments untouched.
    const nextAttachments = sanitizeAttachments(req.body.attachments);
    if (nextAttachments && nextAttachments.length > 0) {
      const over = enforceAttachmentsLimit(req.user, (task.attachments || []).length, nextAttachments.length);
      if (over) return res.status(over.status).json(over.body);
      task.attachments = [...(task.attachments || []), ...nextAttachments];
    }

    const oldAssigneeId = task.assignee ? task.assignee.toString() : null;

    Object.assign(task, allowedUpdates);
    await task.save();

    // Notify the new assignee when the assignment changes to another user.
    const newAssignee = task.assignee ? task.assignee.toString() : null;
    if (req.body.assignee !== undefined && newAssignee && newAssignee !== oldAssigneeId && newAssignee !== req.user._id.toString()) {
      await notifyUser({
        userId: task.assignee,
        type: 'task_assigned',
        title: 'New task assigned to you',
        message: `"${task.title}" was assigned to you`,
        relatedId: task._id,
        relatedType: 'task',
        metadata: { status: task.status },
      });
    }

    // Notify the responsible user (assignee, else owner) on a status change.
    const recipient = newAssignee ? task.assignee : req.user._id;
    if (req.body.status && req.body.status !== oldStatus && recipient.toString() !== req.user._id.toString()) {
      await notifyUser({
        userId: recipient,
        type: 'task_status_changed',
        title: 'Task status changed',
        message: `"${task.title}" changed from "${oldStatus}" to "${req.body.status}"`,
        relatedId: task._id,
        relatedType: 'task',
        metadata: { status: req.body.status },
      });
    }

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
      .populate('comments.userId', 'name email avatar')
      .populate('dependencies.taskId', 'title status');

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

// Delete task (soft). The row stays for TRASH_RETENTION_DAYS so the client can
// offer an instant Undo and a Trash view, instead of asking "are you sure?" and
// then destroying the data anyway.
exports.deleteTask = async (req, res, next) => {
  try {
    const task = await Task.findOneAndUpdate(
      ownedLive(req.user._id, { _id: req.params.id }),
      { $set: { deletedAt: new Date() } },
      { new: true }
    );
    if (!task) return res.status(404).json({ message: 'Task not found' });

    // Drop dependency edges that point at the trashed task so no live task
    // renders a "blocked by <nothing>" chip.
    await Task.updateMany(
      ownedLive(req.user._id, { 'dependencies.taskId': task._id }),
      { $pull: { dependencies: { taskId: task._id } } }
    );

    await logActivity(
      req.user._id, req.user.name, 'task_deleted',
      task._id, task.title, 'Task moved to Trash'
    );

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`user:${req.user._id}`).emit('task:deleted', { _id: task._id });
    }

    res.json({
      message: 'Task moved to Trash',
      _id: task._id,
      deletedAt: task.deletedAt,
      retentionDays: TRASH_RETENTION_DAYS,
    });
  } catch (error) {
    next(error);
  }
};

// ========== Trash ==========
exports.getTrash = async (req, res, next) => {
  try {
    const tasks = await Task.find({ userId: req.user._id, deletedAt: { $ne: null } })
      .sort({ deletedAt: -1 })
      .limit(200)
      .populate('assignee', 'name email avatar')
      .lean();

    const retentionMs = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    res.json({
      retentionDays: TRASH_RETENTION_DAYS,
      tasks: tasks.map((t) => ({
        ...t,
        // Pre-computed so the UI can't drift from the server's idea of when a
        // task actually disappears.
        purgeAt: new Date(new Date(t.deletedAt).getTime() + retentionMs),
      })),
    });
  } catch (error) {
    next(error);
  }
};

exports.restoreTask = async (req, res, next) => {
  try {
    const task = await Task.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, deletedAt: { $ne: null } },
      { $set: { deletedAt: null } },
      { new: true }
    ).populate('assignee', 'name email avatar');
    if (!task) return res.status(404).json({ message: 'Task not found in Trash' });

    await logActivity(
      req.user._id, req.user.name, 'task_restored',
      task._id, task.title, 'Task restored from Trash'
    );

    const io = req.app.get('io');
    if (io) io.to(`user:${req.user._id}`).emit('task:created', task);

    res.json(task);
  } catch (error) {
    next(error);
  }
};

// Permanent delete of one trashed task. Deliberately refuses to touch a live
// task: the only route to destroying data is to trash it first.
exports.purgeTask = async (req, res, next) => {
  try {
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
      deletedAt: { $ne: null },
    });
    if (!task) return res.status(404).json({ message: 'Task not found in Trash' });

    await logActivity(
      req.user._id, req.user.name, 'task_purged',
      task._id, task.title, 'Task permanently deleted'
    );

    res.json({ message: 'Task permanently deleted', _id: task._id });
  } catch (error) {
    next(error);
  }
};

exports.emptyTrash = async (req, res, next) => {
  try {
    const result = await Task.deleteMany({ userId: req.user._id, deletedAt: { $ne: null } });

    await logActivity(
      req.user._id, req.user.name, 'trash_emptied',
      null, '', `Permanently deleted ${result.deletedCount} task(s)`
    );

    res.json({ message: 'Trash emptied', deletedCount: result.deletedCount });
  } catch (error) {
    next(error);
  }
};

// Called by the scheduler: destroy anything that has sat in Trash past the
// retention window.
exports.purgeExpiredTrash = async () => {
  try {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await Task.deleteMany({ deletedAt: { $ne: null, $lte: cutoff } });
    if (result.deletedCount) {
      logger.info('Purged expired trash', { deletedCount: result.deletedCount, cutoff });
    }
    return result.deletedCount;
  } catch (err) {
    logger.error('Failed to purge expired trash', { error: err.message });
    return 0;
  }
};

// ========== Subtask operations ==========
exports.addSubtask = async (req, res, next) => {
  try {
    const task = await Task.findOne(ownedLive(req.user._id, { _id: req.params.id }));
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
    const task = await Task.findOne(ownedLive(req.user._id, { _id: req.params.id }));
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
    const task = await Task.findOne(ownedLive(req.user._id, { _id: req.params.id }));
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
    const task = await Task.findOne(ownedLive(req.user._id, { _id: req.params.id }));
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

    // Notify the task's assignee and owner about the comment, excluding the commenter.
    const recipients = new Set([task.assignee, task.userId]);
    for (const recipient of recipients) {
      if (recipient && recipient.toString() !== req.user._id.toString()) {
        await notifyUser({
          userId: recipient,
          type: 'comment_added',
          title: 'New comment on your task',
          message: `"${req.user.name}" commented on "${task.title}"`,
          relatedId: task._id,
          relatedType: 'task',
        });
      }
    }

    // Notify users mentioned in the comment (@username), excluding the commenter.
    const mentions = (comment.text || '').match(/@([a-zA-Z0-9_]+)/g) || [];
    for (const mention of new Set(mentions)) {
      const username = mention.slice(1).toLowerCase();
      const mentionedUser = await User.findOne({ username });
      if (mentionedUser && mentionedUser._id.toString() !== req.user._id.toString()) {
        await notifyUser({
          userId: mentionedUser._id,
          type: 'mention',
          title: 'You were mentioned',
          message: `"${req.user.name}" mentioned you on "${task.title}"`,
          relatedId: task._id,
          relatedType: 'task',
        });
      }
    }

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
    const task = await Task.findOne(ownedLive(req.user._id, { _id: req.params.id }));
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
    const task = await Task.findOne(ownedLive(req.user._id, { _id: req.params.id }));
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
    const task = await Task.findOne(ownedLive(req.user._id, { _id: req.params.id }));
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
    const task = await Task.findOne(ownedLive(req.user._id, { _id: req.params.id }));
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

    const bulkOps = orders.map((o) => {
      // Validate each entry to prevent NoSQL operator injection via _id/status.
      if (typeof o?._id !== 'string' || (o.status !== undefined && !VALID_STATUSES.has(o.status))) {
        throw Object.assign(new Error('Invalid order entry'), { statusCode: 400 });
      }
      return {
        updateOne: {
          filter: ownedLive(req.user._id, { _id: o._id }),
          update: { $set: { order: Number(o.order) || 0, status: o.status } },
        },
      };
    });

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
    if (typeof updates !== 'object' || updates === null || Array.isArray(updates)) {
      return res.status(400).json({ message: 'updates must be an object' });
    }
    // Reject non-string ids to prevent NoSQL operator injection.
    if (!taskIds.every((id) => typeof id === 'string')) {
      return res.status(400).json({ message: 'taskIds must contain only string ids' });
    }

    const safeUpdates = {};
    for (const key of ALLOWED_BATCH_FIELDS) {
      if (updates[key] !== undefined) {
        safeUpdates[key] = updates[key];
      }
    }

    await Task.updateMany(
      ownedLive(req.user._id, { _id: { $in: taskIds } }),
      { $set: safeUpdates }
    );

    const updated = await Task.find(ownedLive(req.user._id, { _id: { $in: taskIds } }));
    res.json(updated);
  } catch (error) {
    next(error);
  }
};

// ========== Get stats ==========
exports.getStats = async (req, res, next) => {
  try {
    // `{ deletedAt: null }` also matches documents saved before the field
    // existed, so no backfill migration is needed.
    const live = ownedLive(req.user._id);
    const groupBy = (field) => Task.aggregate([
      { $match: live },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    ]);

    const [total, byStatus, byPriority, byCategory, overdue, trashed] = await Promise.all([
      Task.countDocuments(live),
      groupBy('status'),
      groupBy('priority'),
      groupBy('category'),
      Task.countDocuments(ownedLive(req.user._id, {
        dueDate: { $lte: new Date() },
        status: { $nin: ['completed', 'cancelled'] },
      })),
      Task.countDocuments({ userId: req.user._id, deletedAt: { $ne: null } }),
    ]);

    const completedToday = await Task.countDocuments(ownedLive(req.user._id, {
      completedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }));

    res.json({
      total,
      byStatus,
      byPriority,
      byCategory,
      overdue,
      completedToday,
      trashed,
    });
  } catch (error) {
    next(error);
  }
};

// ========== Get activity log ==========
exports.getActivityLog = async (req, res, next) => {
  try {
    const filter = { userId: req.user._id };

    // A task-scoped read backs the detail drawer's history panel. Without the
    // filter it could only ever show whatever happened to fit in the global
    // page, so an older task would look like it had no history at all.
    if (req.query.taskId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.taskId)) {
        return res.status(400).json({ message: 'Invalid task id' });
      }
      filter.taskId = req.query.taskId;
    }

    const requested = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 100) : 50;

    const activities = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(activities);
  } catch (error) {
    next(error);
  }
};

// ========== Export tasks ==========
exports.exportTasks = async (req, res, next) => {
  try {
    const { format = 'json' } = req.query;
    if (format !== 'json' && format !== 'csv') {
      return res.status(400).json({ message: 'Invalid format: must be one of json, csv' });
    }
    const tasks = await Task.find(ownedLive(req.user._id))
      .populate('assignee', 'name email')
      .lean();

    if (format === 'csv') {
      const escapeCsv = escapeCsvCell;
      const headers = ['title','description','status','priority','dueDate','category','tags','isFavorite','estimatedTime','timeSpent','createdAt','updatedAt'];
      const rows = tasks.map(t => [
        escapeCsv(t.title || ''),
        escapeCsv(t.description || ''),
        t.status,
        t.priority,
        escapeCsv(t.dueDate ? new Date(t.dueDate).toISOString() : ''),
        escapeCsv(t.category || ''),
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

// ========== Insights ==========
// Local-day bucketing. Everything in this endpoint is keyed by the *user's*
// calendar day rather than UTC, because a streak that breaks at 5pm because the
// server rolled over is worse than no streak at all. The client sends its
// offset; we fall back to UTC when it doesn't.
const dayKey = (date, offsetMinutes) =>
  new Date(new Date(date).getTime() - offsetMinutes * 60_000).toISOString().slice(0, 10);

const addDays = (key, delta) => {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

// Longest run of consecutive day-keys present in the set, plus the run that ends
// today (or yesterday — a streak shouldn't die until the day is actually over).
const computeStreaks = (dayKeys, todayKey) => {
  const sorted = [...dayKeys].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const key of sorted) {
    run = prev && addDays(prev, 1) === key ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = key;
  }

  const set = new Set(dayKeys);
  let cursor = set.has(todayKey) ? todayKey : addDays(todayKey, -1);
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  return { current, longest, todayDone: set.has(todayKey) };
};

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);

exports.getInsights = async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 180);
    const tzOffset = Number.isFinite(Number(req.query.tzOffset))
      ? Math.max(Math.min(Number(req.query.tzOffset), 840), -840)
      : 0;

    const tasks = await Task.find(ownedLive(req.user._id))
      .select('title status priority category dueDate completedAt createdAt estimatedTime timeSpent')
      .limit(5000)
      .lean();

    const now = new Date();
    const todayKey = dayKey(now, tzOffset);
    const windowStartKey = addDays(todayKey, -(days - 1));

    // Per-day series, pre-seeded so a quiet day is a zero rather than a hole in
    // the chart.
    const series = [];
    for (let i = 0; i < days; i += 1) {
      series.push({ date: addDays(windowStartKey, i), created: 0, completed: 0 });
    }
    const indexOfDay = new Map(series.map((d, i) => [d.date, i]));

    const completedDayKeys = new Set();
    let completedInWindow = 0;
    let createdInWindow = 0;
    let last7 = 0;
    let prev7 = 0;
    const last7Start = addDays(todayKey, -6);
    const prev7Start = addDays(todayKey, -13);

    for (const t of tasks) {
      if (t.createdAt) {
        const key = dayKey(t.createdAt, tzOffset);
        const idx = indexOfDay.get(key);
        if (idx !== undefined) { series[idx].created += 1; createdInWindow += 1; }
      }
      if (t.completedAt) {
        const key = dayKey(t.completedAt, tzOffset);
        completedDayKeys.add(key);
        const idx = indexOfDay.get(key);
        if (idx !== undefined) { series[idx].completed += 1; completedInWindow += 1; }
        if (key >= last7Start) last7 += 1;
        else if (key >= prev7Start) prev7 += 1;
      }
    }

    const open = tasks.filter((t) => !['completed', 'cancelled'].includes(t.status));
    const completedAll = tasks.filter((t) => t.status === 'completed');

    // Burndown walks backwards from today's open count, re-adding what was
    // completed and removing what was created on each day.
    const burndown = [];
    let remaining = open.length;
    for (let i = series.length - 1; i >= 0; i -= 1) {
      burndown[i] = { date: series[i].date, remaining: Math.max(remaining, 0) };
      remaining = remaining + series[i].completed - series[i].created;
    }

    const withDueDate = completedAll.filter((t) => t.dueDate && t.completedAt);
    const onTime = withDueDate.filter((t) => new Date(t.completedAt) <= new Date(t.dueDate));
    const activeDays = [...completedDayKeys].filter((k) => k >= windowStartKey).length;

    const completionRate = pct(completedAll.length, tasks.length);
    const onTimeRate = withDueDate.length ? pct(onTime.length, withDueDate.length) : 100;
    const consistency = pct(activeDays, days);
    // Momentum: this week against last week, centred on 50 so a flat week reads
    // as neutral instead of as a failure.
    const momentum = prev7 === 0
      ? (last7 > 0 ? 75 : 40)
      : Math.max(0, Math.min(100, Math.round(50 * (last7 / prev7))));

    const score = Math.round(
      completionRate * 0.4 + onTimeRate * 0.25 + momentum * 0.2 + consistency * 0.15
    );
    const grade = score >= 85 ? 'Excellent' : score >= 70 ? 'Strong' : score >= 50 ? 'Steady' : score >= 30 ? 'Building' : 'Getting started';

    // Estimates vs actuals — only tasks that carry both numbers can say
    // anything about estimation accuracy.
    const tracked = tasks.filter((t) => (t.timeSpent || 0) > 0);
    const estimated = completedAll.filter((t) => (t.estimatedTime || 0) > 0 && (t.timeSpent || 0) > 0);
    const estimatedTotal = estimated.reduce((s, t) => s + t.estimatedTime, 0);
    const spentOnEstimated = estimated.reduce((s, t) => s + t.timeSpent, 0);

    const byCategory = new Map();
    for (const t of tracked) {
      const key = t.category || 'uncategorized';
      byCategory.set(key, (byCategory.get(key) || 0) + (t.timeSpent || 0));
    }

    const overdueTasks = open.filter((t) => t.dueDate && new Date(t.dueDate) < now);
    const oldestOverdueDays = overdueTasks.reduce((max, t) => {
      const d = Math.floor((now - new Date(t.dueDate)) / 86_400_000);
      return d > max ? d : max;
    }, 0);

    res.json({
      range: { days, from: windowStartKey, to: todayKey, tzOffset },
      score: {
        value: score,
        grade,
        components: { completionRate, onTimeRate, momentum, consistency },
      },
      streak: computeStreaks(completedDayKeys, todayKey),
      velocity: series,
      burndown,
      throughput: {
        completed: completedInWindow,
        created: createdInWindow,
        net: createdInWindow - completedInWindow,
        last7,
        prev7,
      },
      time: {
        spentTotal: tracked.reduce((s, t) => s + (t.timeSpent || 0), 0),
        trackedCount: tracked.length,
        estimatedTotal,
        spentOnEstimated,
        // >100% means work consistently runs longer than estimated.
        accuracy: estimatedTotal > 0 ? Math.round((spentOnEstimated / estimatedTotal) * 100) : null,
        byCategory: [...byCategory.entries()]
          .map(([category, minutes]) => ({ category, minutes }))
          .sort((a, b) => b.minutes - a.minutes)
          .slice(0, 8),
      },
      backlog: {
        open: open.length,
        overdue: overdueTasks.length,
        oldestOverdueDays,
        byPriority: ['critical', 'high', 'medium', 'low', 'none'].map((priority) => ({
          priority,
          count: open.filter((t) => t.priority === priority).length,
        })),
      },
    });
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
      deletedAt: null,
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
