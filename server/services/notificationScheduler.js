const Task = require('../models/Task');
const Notification = require('../models/Notification');
const { notifyUser } = require('./notificationService');
const logger = require('../utils/logger');

const DONE_STATUSES = ['completed', 'cancelled'];
const DAY_MS = 24 * 60 * 60 * 1000;

const dateKey = (date) => new Date(date).toISOString().slice(0, 10);

// One reminder per task/user/day — a task that stays overdue isn't re-announced
// every scheduler tick.
async function alreadySent(userId, type, taskId, reminderDate) {
  return Notification.exists({
    userId,
    type,
    relatedId: taskId,
    'metadata.reminderDate': dateKey(reminderDate),
  });
}

async function sendReminder({ type, task, dueDate, recipient }) {
  if (!recipient) return;
  if (await alreadySent(recipient, type, task._id, dueDate)) return;
  await notifyUser({
    userId: recipient,
    type,
    title: type === 'task_due_soon' ? 'Task due soon' : 'Task overdue',
    message:
      type === 'task_due_soon'
        ? `"${task.title}" is due ${dateKey(dueDate)}`
        : `"${task.title}" was due ${dateKey(dueDate)} and is still open`,
    relatedId: task._id,
    relatedType: 'task',
    metadata: { status: task.status, reminderDate: dateKey(dueDate) },
  });
}

// Scans all open tasks and emits due-soon / overdue reminders, deduped per
// task/user/day. Best-effort: errors are logged, never thrown to the caller.
async function processDueDateNotifications() {
  const now = new Date();
  const soon = new Date(now.getTime() + DAY_MS);

  const tasks = await Task.find({
    status: { $nin: DONE_STATUSES },
    dueDate: { $lte: soon, $ne: null },
  }).select('title status dueDate assignee userId');

  for (const task of tasks) {
    const recipients = new Set([task.userId, task.assignee]);
    const isOverdue = task.dueDate < now;
    for (const recipient of recipients) {
      if (!recipient) continue;
      try {
        await sendReminder({
          type: isOverdue ? 'task_overdue' : 'task_due_soon',
          task,
          dueDate: task.dueDate,
          recipient,
        });
      } catch (err) {
        logger.warn('Notification reminder failed:', err.message);
      }
    }
  }
}

module.exports = { processDueDateNotifications };