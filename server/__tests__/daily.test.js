const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUser, createTestTask } = require('./helpers');
const Task = require('../models/Task');

const app = createApp();
const todayKey = () => new Date().toISOString().slice(0, 10);

describe('Phase 6 daily operating loop', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const setup = await createTestUser({ email: 'daily@example.com' });
    token = setup.accessToken;
    userId = setup.user._id;
  });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  // ─── Inbox quick capture ──────────────────────────────────────
  describe('POST /api/daily/inbox', () => {
    it('creates an inbox task with title only', async () => {
      const res = await auth(request(app).post('/api/daily/inbox')).send({ title: '  Capture me  ' });
      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Capture me');
      expect(res.body.inbox).toBe(true);
    });

    it('requires a title', async () => {
      const res = await auth(request(app).post('/api/daily/inbox')).send({ title: '   ' });
      expect(res.status).toBe(400);
    });

    it('lists inbox separately from overdue/scheduled', async () => {
      await createTestTask(userId, { title: 'Inbox one', inbox: true, status: 'backlog' });
      await createTestTask(userId, { title: 'Overdue one', dueDate: new Date(Date.now() - 86400000), status: 'pending', inbox: false });
      const res = await auth(request(app).get('/api/daily/inbox'));
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
      expect(res.body.tasks[0].title).toBe('Inbox one');
      expect(res.body.overdueCount).toBe(1);
    });
  });

  // ─── Bulk triage ──────────────────────────────────────────────
  describe('POST /api/daily/triage', () => {
    it('triages with project, date, priority and move-to-Today', async () => {
      const a = await createTestTask(userId, { title: 'A', inbox: true, status: 'backlog' });
      const b = await createTestTask(userId, { title: 'B', inbox: true, status: 'backlog' });

      const res = await auth(request(app).post('/api/daily/triage')).send({
        taskIds: [String(a._id), String(b._id)],
        updates: { category: 'work', priority: 'high' },
        moveToToday: true,
      });
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
      const after = await Task.find({ _id: { $in: [a._id, b._id] } }).lean();
      for (const t of after) {
        expect(t.inbox).toBe(false);
        expect(t.category).toBe('work');
        expect(t.priority).toBe('high');
        expect(t.plannedFor).toBeTruthy();
      }
    });

    it('rejects empty triage without moving anything', async () => {
      const t = await createTestTask(userId, { title: 'Keep', inbox: true });
      const res = await auth(request(app).post('/api/daily/triage')).send({ taskIds: [], updates: {} });
      expect(res.status).toBe(400);
      const still = await Task.findById(t._id).lean();
      expect(still.inbox).toBe(true);
    });
  });

  // ─── Today ────────────────────────────────────────────────────
  describe('GET /api/daily/today + PUT /api/daily/top-three', () => {
    it('partitions Top Three / Scheduled / Flexible and never auto-fills Top Three', async () => {
      const key = todayKey();
      const start = new Date(`${key}T00:00:00.000Z`);
      // Scheduled: due today with a clock time.
      await createTestTask(userId, {
        title: 'Scheduled call',
        status: 'pending',
        inbox: false,
        dueDate: new Date(start.getTime() + 10 * 3600_000),
        plannedFor: start,
      });
      // Flexible: planned today, no time.
      await createTestTask(userId, { title: 'Flexible write', status: 'pending', inbox: false, plannedFor: start });

      const res = await auth(request(app).get('/api/daily/today').query({ date: key }));
      expect(res.status).toBe(200);
      expect(res.body.topThree).toHaveLength(0); // never auto-filled
      expect(res.body.scheduled.map((t) => t.title)).toContain('Scheduled call');
      expect(res.body.flexible.map((t) => t.title)).toContain('Flexible write');
    });

    it('enforces max three Top priorities', async () => {
      const made = [];
      for (let i = 0; i < 4; i += 1) {
        made.push(await createTestTask(userId, { title: `T${i}`, inbox: false, status: 'pending' }));
      }
      const ids = made.map((t) => String(t._id));
      const res = await auth(request(app).put('/api/daily/top-three')).send({ taskIds: ids });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/at most 3/i);
    });

    it('sets and replaces Top Three in order', async () => {
      const a = await createTestTask(userId, { title: 'A', inbox: false, status: 'pending' });
      const b = await createTestTask(userId, { title: 'B', inbox: false, status: 'pending' });
      const res = await auth(request(app).put('/api/daily/top-three')).send({ taskIds: [String(a._id), String(b._id)] });
      expect(res.status).toBe(200);
      expect(res.body.topThree.map((t) => t.title)).toEqual(['A', 'B']);
      expect(res.body.count).toBe(2);
    });

    it('persists reorder without changing membership', async () => {
      const a = await createTestTask(userId, { title: 'A', inbox: false, status: 'pending', todayOrder: 0 });
      const res = await auth(request(app).post('/api/daily/reorder')).send({
        orders: [{ _id: String(a._id), todayOrder: 5 }],
      });
      expect(res.status).toBe(200);
      const after = await Task.findById(a._id).lean();
      expect(after.todayOrder).toBe(5);
      expect(after.status).toBe('pending');
    });
  });

  // ─── End-of-day resolution ────────────────────────────────────
  describe('POST /api/daily/resolve', () => {
    it('resolves each task deliberately without duplicating or deleting', async () => {
      const before = await Task.countDocuments({ userId });
      const t1 = await createTestTask(userId, { title: 'Ship', status: 'pending', inbox: false, plannedFor: new Date() });
      const t2 = await createTestTask(userId, { title: 'Drop', status: 'pending', inbox: false, plannedFor: new Date() });
      const t3 = await createTestTask(userId, { title: 'Later', status: 'pending', inbox: false, plannedFor: new Date() });

      const res = await auth(request(app).post('/api/daily/resolve')).send({
        resolutions: [
          { taskId: String(t1._id), action: 'complete' },
          { taskId: String(t2._id), action: 'no-longer-needed' },
          { taskId: String(t3._id), action: 'backlog' },
        ],
      });
      expect(res.status).toBe(200);
      expect(res.body.summary).toMatchObject({ completed: 1, dismissed: 1, backlogged: 1, total: 3 });
      expect(res.body.previous).toHaveLength(3);

      // No copies were made, nothing was hard-deleted.
      const after = await Task.countDocuments({ userId });
      expect(after).toBe(before + 3);
      const statuses = Object.fromEntries(
        (await Task.find({ _id: { $in: [t1._id, t2._id, t3._id] } }).lean()).map((t) => [t.title, t.status])
      );
      expect(statuses).toMatchObject({ Ship: 'completed', Drop: 'cancelled', Later: 'backlog' });
    });

    it('moves to tomorrow with an explicit date action', async () => {
      const t = await createTestTask(userId, { title: 'Carry', status: 'pending', inbox: false, plannedFor: new Date() });
      const res = await auth(request(app).post('/api/daily/resolve')).send({
        resolutions: [{ taskId: String(t._id), action: 'tomorrow' }],
      });
      expect(res.status).toBe(200);
      expect(res.body.summary.movedTomorrow).toBe(1);
    });

    it('rejects unknown actions without moving anything', async () => {
      const t = await createTestTask(userId, { title: 'Stay', status: 'pending', inbox: false });
      const res = await auth(request(app).post('/api/daily/resolve')).send({
        resolutions: [{ taskId: String(t._id), action: 'teleport' }],
      });
      expect(res.status).toBe(400);
      const still = await Task.findById(t._id).lean();
      expect(still.status).toBe('pending');
    });
  });

  // ─── Weekly reset ─────────────────────────────────────────────
  describe('weekly review', () => {
    it('returns inbox, overdue, recap and candidates without streaks', async () => {
      await createTestTask(userId, { title: 'Untriaged', inbox: true, status: 'backlog' });
      await createTestTask(userId, { title: 'Late', status: 'pending', inbox: false, dueDate: new Date(Date.now() - 2 * 86400000) });
      await createTestTask(userId, { title: 'Done', status: 'completed', completedAt: new Date(), inbox: false });

      const res = await auth(request(app).get('/api/daily/weekly-review'));
      expect(res.status).toBe(200);
      expect(res.body.inbox.count).toBe(1);
      expect(res.body.overdueCount).toBe(1);
      expect(res.body.completedCount).toBe(1);
      expect(Array.isArray(res.body.nextWeekCandidates)).toBe(true);
      expect(res.body).not.toHaveProperty('streak');
      expect(res.body).not.toHaveProperty('score');
    });

    it('dismisses without pressure', async () => {
      const res = await auth(request(app).post('/api/daily/weekly-dismiss'));
      expect(res.status).toBe(200);
      expect(res.body.dismissedAt).toBeTruthy();
    });
  });

  // ─── Starter templates ────────────────────────────────────────
  describe('starter templates', () => {
    it('lists the four onboarding starters', async () => {
      const res = await auth(request(app).get('/api/templates/starters'));
      expect(res.status).toBe(200);
      expect(res.body.starters.map((s) => s.key).sort()).toEqual(
        ['freelancer-client-work', 'personal-weekly-plan', 'small-team-sprint', 'student-semester-planner'].sort()
      );
    });

    it('applies a starter as ordinary tasks (no special models)', async () => {
      const res = await auth(request(app).post('/api/templates/starters/personal-weekly-plan/apply'));
      expect(res.status).toBe(201);
      expect(res.body.count).toBeGreaterThan(0);
      const created = await Task.find({ userId, tags: 'weekly-plan' }).lean();
      expect(created.length).toBe(res.body.count);
      for (const t of created) {
        expect(t.inbox).toBe(false);
        expect(t.title).toBeTruthy();
      }
    });

    it('404s unknown starters', async () => {
      const res = await auth(request(app).post('/api/templates/starters/nope/apply'));
      expect(res.status).toBe(404);
    });
  });

  // ─── Task filters ─────────────────────────────────────────────
  describe('GET /api/tasks inbox/plannedFor filters', () => {
    it('filters by inbox flag', async () => {
      await createTestTask(userId, { title: 'In', inbox: true });
      await createTestTask(userId, { title: 'Out', inbox: false });
      const res = await auth(request(app).get('/api/tasks').query({ inbox: 'true', paginate: 'false' }));
      expect(res.status).toBe(200);
      expect(res.body.map((t) => t.title)).toEqual(['In']);
    });
  });
});
