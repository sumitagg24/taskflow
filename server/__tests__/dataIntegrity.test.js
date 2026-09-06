const request = require('supertest');
const mongoose = require('mongoose');
const { createApp } = require('./setup');
const { createTestUser, createTestTask } = require('./helpers');
const Task = require('../models/Task');
const TimeSession = require('../models/TimeSession');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const { processRecurringTasks, purgeExpiredTrash } = require('../controllers/taskController');
const { processDueDateNotifications } = require('../services/notificationScheduler');

const app = createApp();

// Data-integrity audit: recurring idempotency, purge cascades, ownership invariants.
describe('Data integrity', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const setup = await createTestUser({ email: 'data@example.com', username: 'datauser' });
    token = setup.accessToken;
    userId = setup.user._id;
  });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const trash = (id) => auth(request(app).delete(`/api/tasks/${id}`));

  describe('recurring idempotency', () => {
    // One recurrence due, and the *next* recurrence lands in the future, so a
    // second sweep must find nothing — unless the guard regresses and the
    // same recurrence forks a duplicate.
    const makeDueRecurring = () => createTestTask(userId, {
      title: 'Recurring',
      status: 'completed',
      isRecurring: true,
      recurringInterval: 'daily',
      dueDate: new Date(Date.now() - 2 * 60 * 60 * 1000),
      recurringNextDate: new Date(Date.now() - 60 * 60 * 1000),
    });

    it('generates exactly one child on back-to-back runs (restart simulation)', async () => {
      const parent = await makeDueRecurring();
      const prevNext = parent.recurringNextDate.getTime();

      await processRecurringTasks();
      await processRecurringTasks(); // second sweep: restart / overlapping tick

      const children = await Task.find({ userId, _id: { $ne: parent._id } });
      expect(children).toHaveLength(1);
      expect(children[0].status).toBe('pending');
      expect(new Date(children[0].dueDate).getTime()).toBe(prevNext);

      const freshParent = await Task.findById(parent._id);
      expect(new Date(freshParent.recurringNextDate).getTime()).toBeGreaterThan(prevNext);
    });

    it('generates exactly one child under overlapping ticks', async () => {
      const parent = await makeDueRecurring();

      await Promise.all([processRecurringTasks(), processRecurringTasks()]);

      const count = await Task.countDocuments({ userId, _id: { $ne: parent._id } });
      expect(count).toBe(1);
      expect(parent).toBeTruthy();
    });
  });

  describe('purge cascades', () => {
    it('purgeTask deletes the task TimeSessions', async () => {
      const task = await createTestTask(userId);
      await TimeSession.create({ taskId: task._id, userId, start: new Date() });
      await trash(task._id);

      const res = await auth(request(app).delete(`/api/tasks/${task._id}/purge`));
      expect(res.status).toBe(200);
      expect(await TimeSession.countDocuments({ taskId: task._id })).toBe(0);
    });

    it('emptyTrash deletes sessions of trashed tasks but keeps live ones', async () => {
      const live = await createTestTask(userId, { title: 'Live' });
      const doomed = await createTestTask(userId, { title: 'Doomed' });
      await TimeSession.create({ taskId: live._id, userId, start: new Date() });
      await TimeSession.create({ taskId: doomed._id, userId, start: new Date() });
      await trash(doomed._id);

      const res = await auth(request(app).delete('/api/tasks/trash'));
      expect(res.status).toBe(200);
      expect(await TimeSession.countDocuments({ taskId: doomed._id })).toBe(0);
      expect(await TimeSession.countDocuments({ taskId: live._id })).toBe(1);
    });

    it('purgeExpiredTrash deletes sessions of expired trash', async () => {
      const old = await createTestTask(userId, {
        deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
      });
      await TimeSession.create({ taskId: old._id, userId, start: new Date() });

      const purged = await purgeExpiredTrash();
      expect(purged).toBe(1);
      expect(await TimeSession.countDocuments({ taskId: old._id })).toBe(0);
    });

    it('keeps the ActivityLog audit trail and tolerates dangling notification relatedId', async () => {
      const task = await createTestTask(userId, { title: 'Doomed' });
      const notif = await Notification.create({
        userId,
        type: 'task_assigned',
        title: 'Assigned',
        message: 'Task was assigned',
        relatedId: task._id,
        relatedType: 'task',
      });
      await trash(task._id);
      await auth(request(app).delete(`/api/tasks/${task._id}/purge`));

      // Audit trail survives the purge.
      expect(await ActivityLog.countDocuments({ userId })).toBeGreaterThan(0);

      // Notification list still serves the dangling row (no 500).
      const list = await auth(request(app).get('/api/notifications'));
      expect(list.status).toBe(200);
      expect(list.body.items.some((i) => i._id === String(notif._id))).toBe(true);

      // Opening the purged task is a clean 404, not a 500.
      const open = await auth(request(app).get(`/api/tasks/${task._id}`));
      expect(open.status).toBe(404);

      // The dangling notification can still be marked read.
      const read = await auth(request(app).put(`/api/notifications/${notif._id}/read`));
      expect(read.status).toBe(200);

      // Timer history degrades gracefully over orphaned sessions.
      const hist = await auth(request(app).get('/api/time-tracking/history'));
      expect(hist.status).toBe(200);
    });
  });

  describe('ownership invariants', () => {
    it('ignores userId in the update body (no mass-assignment)', async () => {
      const other = await createTestUser({ email: 'other-data@example.com', username: 'dataother' });
      const task = await createTestTask(userId);

      const res = await auth(
        request(app).put(`/api/tasks/${task._id}`).send({ title: 'Renamed', userId: other.user._id })
      );
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Renamed');
      expect(String(res.body.userId)).toBe(String(userId));

      const fresh = await Task.findById(task._id);
      expect(String(fresh.userId)).toBe(String(userId));
    });

    it('subtask and comment writes cannot reassign ownership', async () => {
      const other = await createTestUser({ email: 'other2@example.com', username: 'dataother2' });
      const task = await createTestTask(userId);

      const sub = await auth(
        request(app).post(`/api/tasks/${task._id}/subtasks`).send({ title: 'Step', userId: other.user._id })
      );
      expect(sub.status).toBe(200);

      const cmt = await auth(
        request(app).post(`/api/tasks/${task._id}/comments`).send({ text: 'Hi', userId: other.user._id })
      );
      expect(cmt.status).toBe(200);
      const comments = cmt.body.comments;
      const last = comments[comments.length - 1];
      expect(String(last.userId._id || last.userId)).toBe(String(userId));

      const fresh = await Task.findById(task._id);
      expect(String(fresh.userId)).toBe(String(userId));
    });

    it('ghost assignee is harmless: populate degrades to null, scheduler survives', async () => {
      const ghost = new mongoose.Types.ObjectId();
      const res = await auth(
        request(app).post('/api/tasks').send({
          title: 'Ghost assigned',
          assignee: String(ghost),
          dueDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })
      );
      expect(res.status).toBe(201);

      const got = await auth(request(app).get(`/api/tasks/${res.body._id}`));
      expect(got.status).toBe(200);
      expect(got.body.assignee).toBeNull();

      await expect(processDueDateNotifications()).resolves.not.toThrow();
    });

    it('rejects a malformed assignee with 400, not 500', async () => {
      const bad = await auth(
        request(app).post('/api/tasks').send({ title: 'Bad assignee', assignee: 'not-an-id' })
      );
      expect(bad.status).toBe(400);

      const task = await createTestTask(userId);
      const badPut = await auth(
        request(app).put(`/api/tasks/${task._id}`).send({ assignee: 'not-an-id' })
      );
      expect(badPut.status).toBe(400);
    });
  });
});
