const Task = require('../models/Task');
const mongoose = require('mongoose');
const { STARTER_TEMPLATES } = require('../data/starterTemplates');
const { enforceTaskLimit } = require('./growthController');
const logger = require('../utils/logger');

const ownedLive = (userId, extra = {}) => ({ ...extra, userId, deletedAt: null });

const OPEN_STATUSES = ['backlog', 'pending', 'in-progress', 'blocked', 'review'];
const VALID_PRIORITIES = new Set(['critical', 'high', 'medium', 'low', 'none']);
const MAX_TOP_THREE = 3;

const isValidDateString = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !isNaN(d.getTime());
};

const parseTzOffset = (v) => {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(Math.min(Math.trunc(n), 840), -840);
};

/**
 * Local-day window for a YYYY-MM-DD + client tzOffset (minutes, as from
 * getTimezoneOffset). start is the UTC instant the client's day begins.
 */
const dayWindow = (dateStr, tzOffsetMinutes) => {
  const midnightUTC = new Date(`${dateStr}T00:00:00.000Z`);
  const start = new Date(midnightUTC.getTime() + tzOffsetMinutes * 60_000);
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
};

const todayKeyUTC = (tzOffsetMinutes) => {
  const now = Date.now() - tzOffsetMinutes * 60_000;
  return new Date(now).toISOString().slice(0, 10);
};

const hasClockTime = (d) => {
  if (!d) return false;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return false;
  return dt.getUTCHours() !== 0 || dt.getUTCMinutes() !== 0 || dt.getUTCSeconds() !== 0;
};

const toDayKey = (d, tzOffsetMinutes) => {
  const dt = new Date(new Date(d).getTime() - tzOffsetMinutes * 60_000);
  return dt.toISOString().slice(0, 10);
};

const sortScheduled = (a, b) => {
  const at = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
  const bt = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
  if (at !== bt) return at - bt;
  return (a.todayOrder || 0) - (b.todayOrder || 0);
};

const sortFlexible = (a, b) => {
  const ao = a.todayOrder || 0;
  const bo = b.todayOrder || 0;
  if (ao !== bo) return ao - bo;
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
};

// ─── GET /api/daily/today ─────────────────────────────────────────────
// Canonical Today: one Task model, three derived sections. Inbox rows never
// appear here (they must be triaged first) so Inbox vs overdue/scheduled is
// unambiguous in the UI.
exports.getToday = async (req, res, next) => {
  try {
    const tzOffset = parseTzOffset(req.query.tzOffset);
    const date = typeof req.query.date === 'string' && isValidDateString(req.query.date)
      ? req.query.date
      : todayKeyUTC(tzOffset);
    if (req.query.date !== undefined && !isValidDateString(req.query.date)) {
      return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    }
    const { start, end } = dayWindow(date, tzOffset);

    const base = ownedLive(req.user._id, { inbox: { $ne: true } });
    const [planned, dueToday, overdue, completedToday, inboxCount] = await Promise.all([
      Task.find({ ...base, plannedFor: { $gte: start, $lt: end }, status: { $in: [...OPEN_STATUSES, 'completed'] } })
        .sort({ isTopThree: -1, topThreeOrder: 1, todayOrder: 1, createdAt: 1 }).lean(),
      Task.find({ ...base, dueDate: { $gte: start, $lt: end }, status: { $in: OPEN_STATUSES } }).lean(),
      Task.find({ ...base, dueDate: { $lt: start }, status: { $in: OPEN_STATUSES } })
        .sort({ dueDate: 1 }).limit(100).lean(),
      Task.find({ ...base, status: 'completed', completedAt: { $gte: start, $lt: end } }).lean(),
      Task.countDocuments(ownedLive(req.user._id, { inbox: true })),
    ]);

    // Merge planned + due-today by id (a task can qualify both ways — it must
    // still appear exactly once).
    const byId = new Map();
    for (const t of [...planned, ...dueToday]) {
      if (!byId.has(String(t._id))) byId.set(String(t._id), t);
    }
    // Only open tasks belong in the three working sections.
    const open = [...byId.values()].filter((t) => OPEN_STATUSES.includes(t.status));

    const topThree = open
      .filter((t) => t.isTopThree)
      .sort((a, b) => (a.topThreeOrder || 0) - (b.topThreeOrder || 0))
      .slice(0, MAX_TOP_THREE);
    const topIds = new Set(topThree.map((t) => String(t._id)));

    const scheduled = open
      .filter((t) => !topIds.has(String(t._id)) && t.dueDate && new Date(t.dueDate) >= start && new Date(t.dueDate) < end && hasClockTime(t.dueDate))
      .sort(sortScheduled);
    const scheduledIds = new Set(scheduled.map((t) => String(t._id)));

    const flexible = open
      .filter((t) => !topIds.has(String(t._id)) && !scheduledIds.has(String(t._id)))
      .sort(sortFlexible);

    res.json({
      date,
      tzOffset,
      counts: {
        topThree: topThree.length,
        scheduled: scheduled.length,
        flexible: flexible.length,
        overdue: overdue.length,
        inbox: inboxCount,
        completedToday: completedToday.length,
      },
      topThree,
      scheduled,
      flexible,
      overdue,
      completedToday,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/daily/inbox ────────────────────────────────────────────
// Quick capture: title only. Everything else gets a sane untriaged default.
exports.createInboxTask = async (req, res, next) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    if (!title) return res.status(400).json({ message: 'Title is required' });
    if (title.length > 200) return res.status(400).json({ message: 'Title cannot exceed 200 characters' });

    const limitHit = await enforceTaskLimit(req.user);
    if (limitHit) return res.status(limitHit.status).json(limitHit.body);

    const task = await Task.create({
      title: title.replace(/[<>"']/g, ''),
      userId: req.user._id,
      status: 'backlog',
      priority: 'medium',
      inbox: true,
      plannedFor: null,
      isTopThree: false,
      topThreeOrder: 0,
      todayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/daily/inbox ─────────────────────────────────────────────
exports.getInbox = async (req, res, next) => {
  try {
    const tasks = await Task.find(ownedLive(req.user._id, { inbox: true }))
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    // Overdue + scheduled counts so the UI can label "Inbox is not overdue".
    const now = new Date();
    const overdueCount = await Task.countDocuments(
      ownedLive(req.user._id, { inbox: { $ne: true }, dueDate: { $lt: now }, status: { $in: OPEN_STATUSES } })
    );
    res.json({ tasks, count: tasks.length, overdueCount });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/daily/triage ───────────────────────────────────────────
// Bulk triage: assign project(category), assign date, set priority, move to
// Today, archive/delete. Clearing `inbox` is the default (explicit triage);
// pass keepInbox:true to leave rows untriaged.
exports.triageInbox = async (req, res, next) => {
  try {
    const { taskIds, updates = {}, moveToToday = false, keepInbox = false, date, tzOffset } = req.body || {};
    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ message: 'taskIds must be a non-empty array' });
    }
    if (taskIds.length > 100) return res.status(400).json({ message: 'Cannot triage more than 100 tasks at once' });
    if (!taskIds.every((id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: 'taskIds must contain only valid task ids' });
    }
    if (typeof updates !== 'object' || updates === null || Array.isArray(updates)) {
      return res.status(400).json({ message: 'updates must be an object' });
    }

    const allowed = ['category', 'priority', 'dueDate', 'plannedFor', 'status', 'tags', 'assignee'];
    const safe = {};
    for (const k of allowed) {
      if (updates[k] !== undefined) safe[k] = updates[k];
    }
    if (safe.priority !== undefined && !VALID_PRIORITIES.has(safe.priority)) {
      return res.status(400).json({ message: 'Invalid priority' });
    }
    if (safe.status !== undefined && !['backlog', 'pending', 'in-progress', 'blocked', 'review'].includes(safe.status)) {
      return res.status(400).json({ message: 'Invalid status for triage' });
    }
    for (const dk of ['dueDate', 'plannedFor']) {
      if (safe[dk] !== undefined && safe[dk] !== null) {
        const d = new Date(safe[dk]);
        if (isNaN(d.getTime())) return res.status(400).json({ message: `${dk} must be a valid date` });
        safe[dk] = d;
      }
    }
    if (moveToToday) {
      const off = parseTzOffset(tzOffset);
      const key = typeof date === 'string' && isValidDateString(date) ? date : todayKeyUTC(off);
      const { start } = dayWindow(key, off);
      safe.plannedFor = start;
      safe.inbox = false;
      if (!safe.status) safe.status = 'pending';
    } else if (!keepInbox) {
      safe.inbox = false;
    }

    await Task.updateMany(ownedLive(req.user._id, { _id: { $in: taskIds } }), { $set: safe });
    const updated = await Task.find(ownedLive(req.user._id, { _id: { $in: taskIds } })).lean();
    res.json({ updated, count: updated.length });
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/daily/top-three ─────────────────────────────────────────
// User-controlled only: replaces the day's Top Three wholesale, max 3. Never
// auto-filled — an empty array is a valid "no priorities yet" state.
exports.setTopThree = async (req, res, next) => {
  try {
    const { taskIds, date, tzOffset } = req.body || {};
    if (!Array.isArray(taskIds)) return res.status(400).json({ message: 'taskIds must be an array' });
    if (taskIds.length > MAX_TOP_THREE) {
      return res.status(400).json({ message: `Top Three holds at most ${MAX_TOP_THREE} tasks`, max: MAX_TOP_THREE });
    }
    if (!taskIds.every((id) => typeof id === 'string' && mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: 'taskIds must contain only valid task ids' });
    }
    if (new Set(taskIds).size !== taskIds.length) {
      return res.status(400).json({ message: 'taskIds must not contain duplicates' });
    }
    const off = parseTzOffset(tzOffset);
    const key = typeof date === 'string' && isValidDateString(date) ? date : todayKeyUTC(off);
    if (req.body?.date !== undefined && !isValidDateString(req.body.date)) {
      return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    }
    const { start, end } = dayWindow(key, off);

    // Only live tasks the user owns can be promoted.
    const found = taskIds.length
      ? await Task.find(ownedLive(req.user._id, { _id: { $in: taskIds } })).select('_id')
      : [];
    if (found.length !== taskIds.length) {
      return res.status(404).json({ message: 'One or more tasks were not found' });
    }

    // Demote the rest of the day's Top Three first (explicit, no orphans).
    await Task.updateMany(
      ownedLive(req.user._id, { plannedFor: { $gte: start, $lt: end }, isTopThree: true }),
      { $set: { isTopThree: false, topThreeOrder: 0 } }
    );
    // Promote in order; promotion also plans the task for the day and clears
    // the inbox flag (a Top Three task is triaged by definition).
    for (let i = 0; i < taskIds.length; i += 1) {
      await Task.updateOne(
        ownedLive(req.user._id, { _id: taskIds[i] }),
        { $set: { isTopThree: true, topThreeOrder: i, plannedFor: start, inbox: false } }
      );
    }
    const topThree = await Task.find(ownedLive(req.user._id, { plannedFor: { $gte: start, $lt: end }, isTopThree: true }))
      .sort({ topThreeOrder: 1 }).lean();
    res.json({ date: key, topThree, count: topThree.length, max: MAX_TOP_THREE });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/daily/reorder ──────────────────────────────────────────
// Persist Today drag-and-drop / keyboard reorder. todayOrder and
// topThreeOrder only — section membership is derived, never duplicated.
exports.reorderToday = async (req, res, next) => {
  try {
    const { orders } = req.body || {};
    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({ message: 'orders must be a non-empty array' });
    }
    if (orders.length > 100) return res.status(400).json({ message: 'Cannot reorder more than 100 tasks at once' });
    const ops = [];
    for (const o of orders) {
      if (!o || typeof o._id !== 'string' || !mongoose.Types.ObjectId.isValid(o._id)) {
        return res.status(400).json({ message: 'Each order entry needs a valid _id' });
      }
      const set = {};
      if (o.todayOrder !== undefined) {
        const n = Number(o.todayOrder);
        if (!Number.isInteger(n) || n < 0 || n > 100000) return res.status(400).json({ message: 'todayOrder must be an integer 0..100000' });
        set.todayOrder = n;
      }
      if (o.topThreeOrder !== undefined) {
        const n = Number(o.topThreeOrder);
        if (!Number.isInteger(n) || n < 0 || n > 10) return res.status(400).json({ message: 'topThreeOrder must be an integer 0..10' });
        set.topThreeOrder = n;
      }
      if (Object.keys(set).length === 0) return res.status(400).json({ message: 'Each order entry needs todayOrder or topThreeOrder' });
      ops.push({ updateOne: { filter: ownedLive(req.user._id, { _id: o._id }), update: { $set: set } } });
    }
    if (ops.length) await Task.bulkWrite(ops);
    res.json({ message: 'Today order saved', count: ops.length });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/daily/resolve ──────────────────────────────────────────
// End-of-day: every incomplete Today task gets a deliberate disposition.
// Never creates copies (no duplication) and never deletes (no silent
// discard — "no longer needed" maps to cancelled, which stays queryable).
exports.resolveDay = async (req, res, next) => {
  try {
    const { date, tzOffset, resolutions } = req.body || {};
    const off = parseTzOffset(tzOffset);
    const key = typeof date === 'string' && isValidDateString(date) ? date : todayKeyUTC(off);
    if (req.body?.date !== undefined && !isValidDateString(req.body.date)) {
      return res.status(400).json({ message: 'date must be YYYY-MM-DD' });
    }
    if (!Array.isArray(resolutions) || resolutions.length === 0) {
      return res.status(400).json({ message: 'resolutions must be a non-empty array' });
    }
    if (resolutions.length > 100) return res.status(400).json({ message: 'Cannot resolve more than 100 tasks at once' });

    const { start, end } = dayWindow(key, off);
    const tomorrow = new Date(start.getTime() + 86_400_000);
    const summary = { completed: 0, movedTomorrow: 0, scheduled: 0, backlogged: 0, dismissed: 0, total: resolutions.length };
    const previous = [];
    const resolved = [];

    for (const r of resolutions) {
      if (!r || typeof r.taskId !== 'string' || !mongoose.Types.ObjectId.isValid(r.taskId)) {
        return res.status(400).json({ message: 'Each resolution needs a valid taskId' });
      }
      const valid = ['tomorrow', 'date', 'backlog', 'no-longer-needed', 'complete'];
      if (!valid.includes(r.action)) {
        return res.status(400).json({ message: 'Invalid resolution action: must be one of tomorrow, date, backlog, no-longer-needed, complete' });
      }
      const task = await Task.findOne(ownedLive(req.user._id, { _id: r.taskId }));
      if (!task) return res.status(404).json({ message: `Task not found: ${r.taskId}` });
      previous.push({
        taskId: String(task._id), status: task.status, plannedFor: task.plannedFor,
        isTopThree: task.isTopThree, topThreeOrder: task.topThreeOrder, completedAt: task.completedAt,
      });

      if (r.action === 'tomorrow') {
        task.plannedFor = tomorrow; task.isTopThree = false; task.topThreeOrder = 0; task.inbox = false;
        if (task.status === 'completed' || task.status === 'cancelled') task.status = 'pending';
        summary.movedTomorrow += 1;
      } else if (r.action === 'date') {
        if (typeof r.date !== 'string' || !isValidDateString(r.date)) {
          return res.status(400).json({ message: 'Resolution action "date" needs a valid date (YYYY-MM-DD)' });
        }
        const { start: s } = dayWindow(r.date, off);
        task.plannedFor = s; task.isTopThree = false; task.topThreeOrder = 0; task.inbox = false;
        if (task.status === 'completed' || task.status === 'cancelled') task.status = 'pending';
        summary.scheduled += 1;
      } else if (r.action === 'backlog') {
        task.plannedFor = null; task.isTopThree = false; task.topThreeOrder = 0; task.inbox = false;
        task.status = 'backlog';
        summary.backlogged += 1;
      } else if (r.action === 'no-longer-needed') {
        task.plannedFor = null; task.isTopThree = false; task.topThreeOrder = 0;
        task.status = 'cancelled';
        summary.dismissed += 1;
      } else if (r.action === 'complete') {
        task.status = 'completed'; task.completedAt = new Date();
        task.isTopThree = false; task.topThreeOrder = 0;
        summary.completed += 1;
      }
      await task.save();
      resolved.push({ taskId: String(task._id), action: r.action, status: task.status });
    }

    logger.info('End-of-day resolution', { userId: String(req.user._id), date: key, summary });
    res.json({ date: key, summary, resolved, previous, window: { start, end } });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/daily/weekly-review ─────────────────────────────────────
// Lightweight, optional review. Deliberately no streaks/scores — just the
// four prompts: inbox, overdue, recap, next-week priorities.
exports.getWeeklyReview = async (req, res, next) => {
  try {
    const tzOffset = parseTzOffset(req.query.tzOffset);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const { start: todayStart } = dayWindow(todayKeyUTC(tzOffset), tzOffset);

    const base = ownedLive(req.user._id);
    const [inboxTasks, overdue, completedWeek] = await Promise.all([
      Task.find({ ...base, inbox: true }).sort({ createdAt: -1 }).limit(50).lean(),
      Task.find({ ...base, inbox: { $ne: true }, dueDate: { $lt: todayStart }, status: { $in: OPEN_STATUSES } })
        .sort({ dueDate: 1 }).limit(50).lean(),
      Task.find({ ...base, status: 'completed', completedAt: { $gte: weekAgo } })
        .sort({ completedAt: -1 }).limit(50).lean(),
    ]);
    const inboxCount = await Task.countDocuments({ ...base, inbox: true });
    const candidates = await Task.find({ ...base, inbox: { $ne: true }, status: { $in: ['backlog', 'pending'] } })
      .sort({ priority: 1, dueDate: 1, createdAt: -1 }).limit(20).lean();

    res.json({
      inbox: { count: inboxCount, sample: inboxTasks.slice(0, 5), tasks: inboxTasks },
      overdue,
      overdueCount: overdue.length,
      completedThisWeek: completedWeek,
      completedCount: completedWeek.length,
      nextWeekCandidates: candidates,
      dismissedAt: req.user.weeklyResetDismissedAt || null,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/daily/weekly-dismiss ───────────────────────────────────
exports.dismissWeekly = async (req, res, next) => {
  try {
    req.user.weeklyResetDismissedAt = new Date();
    await req.user.save();
    res.json({ dismissedAt: req.user.weeklyResetDismissedAt });
  } catch (err) {
    next(err);
  }
};

// ─── Starter templates (ordinary tasks) ───────────────────────────────
exports.getStarters = async (req, res) => {
  res.json({
    starters: STARTER_TEMPLATES.map((s) => ({
      key: s.key, title: s.title, description: s.description,
      category: s.category, tags: s.tags, taskCount: s.tasks.length,
      tasks: s.tasks,
    })),
  });
};

exports.applyStarter = async (req, res, next) => {
  try {
    const { key } = req.params;
    const starter = STARTER_TEMPLATES.find((s) => s.key === key);
    if (!starter) return res.status(404).json({ message: 'Starter template not found' });

    // Plan ceiling applies — starters are ordinary tasks, not a backdoor.
    const TaskModel = Task;
    const liveCount = await TaskModel.countDocuments(
      ownedLive(req.user._id, { status: { $nin: ['completed', 'cancelled'] } })
    );
    const { getPlan } = require('../config/plans');
    const limit = getPlan(req.user.plan || 'free').limits.activeTasks;
    if (limit !== null && limit !== undefined && liveCount + starter.tasks.length > limit) {
      return res.status(402).json({
        message: `This starter adds ${starter.tasks.length} tasks but your plan allows ${limit} active tasks.`,
        code: 'PLAN_LIMIT_REACHED', limit, used: liveCount, resource: 'activeTasks',
      });
    }

    const docs = starter.tasks.map((t, i) => ({
      title: t.title,
      description: t.description || '',
      status: t.status || 'backlog',
      priority: t.priority || 'medium',
      category: t.category || starter.category || 'uncategorized',
      tags: t.tags || starter.tags || [],
      estimatedTime: t.estimatedTime || 0,
      userId: req.user._id,
      inbox: false,
      plannedFor: null,
      isTopThree: false,
      topThreeOrder: 0,
      todayOrder: i,
    }));
    const created = await Task.insertMany(docs);
    res.status(201).json({ starter: starter.key, count: created.length, tasks: created });
  } catch (err) {
    next(err);
  }
};

exports.toDayKey = toDayKey;
exports.MAX_TOP_THREE = MAX_TOP_THREE;
