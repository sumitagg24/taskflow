const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUser, createTestTask } = require('./helpers');

const app = createApp();

describe('Tasks Endpoints', () => {
  let token, userId;

  beforeEach(async () => {
    const setup = await createTestUser({ email: 'tasks@example.com' });
    token = setup.accessToken;
    userId = setup.user._id;
  });

  // ─── CRUD ──────────────────────────────────────────────

  describe('POST /api/tasks', () => {
    it('creates a task', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'My Task', description: 'Task description', priority: 'high' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('_id');
      expect(res.body.title).toBe('My Task');
      expect(res.body.priority).toBe('high');
      expect(res.body.userId.toString()).toBe(userId.toString());
    });

    it('rejects task without title', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'No title' });

      expect(res.status).toBe(400);
    });

    it('rejects task without auth', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .send({ title: 'Unauthorized' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/tasks', () => {
    it('returns empty list when no tasks', async () => {
      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(0);
    });

    it('returns user tasks', async () => {
      await createTestTask(userId, { title: 'Task 1' });
      await createTestTask(userId, { title: 'Task 2' });

      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    it('filters by status', async () => {
      await createTestTask(userId, { title: 'Pending', status: 'pending' });
      await createTestTask(userId, { title: 'Completed', status: 'completed' });

      const res = await request(app)
        .get('/api/tasks?status=completed')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toBe('Completed');
    });

    it('searches by title', async () => {
      await createTestTask(userId, { title: 'Buy groceries' });
      await createTestTask(userId, { title: 'Write report' });

      const res = await request(app)
        .get('/api/tasks?search=groceries')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toMatch(/groceries/i);
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('returns a single task', async () => {
      const task = await createTestTask(userId);
      const res = await request(app)
        .get(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.title).toBe(task.title);
    });

    it('returns 404 for non-existent task', async () => {
      const fakeId = '000000000000000000000000';
      const res = await request(app)
        .get(`/api/tasks/${fakeId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('updates a task', async () => {
      const task = await createTestTask(userId, { status: 'pending' });
      const res = await request(app)
        .put(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'completed', priority: 'critical' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.priority).toBe('critical');
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('deletes a task', async () => {
      const task = await createTestTask(userId);
      const res = await request(app)
        .delete(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/deleted/i);
    });
  });

  // ─── Subtasks ───────────────────────────────────────────

  describe('Subtask Operations', () => {
    it('adds a subtask', async () => {
      const task = await createTestTask(userId);
      const res = await request(app)
        .post(`/api/tasks/${task._id}/subtasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Subtask 1' });

      expect(res.status).toBe(200);
      expect(res.body.subtasks.length).toBe(1);
      expect(res.body.subtasks[0].title).toBe('Subtask 1');
    });

    it('completes a subtask', async () => {
      const task = await createTestTask(userId);
      task.subtasks.push({ title: 'Sub', completed: false });
      await task.save();
      const subtaskId = task.subtasks[0]._id;

      const res = await request(app)
        .put(`/api/tasks/${task._id}/subtasks/${subtaskId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ completed: true });

      expect(res.status).toBe(200);
      expect(res.body.subtasks[0].completed).toBe(true);
    });

    it('deletes a subtask', async () => {
      const task = await createTestTask(userId);
      task.subtasks.push({ title: 'Delete me', completed: false });
      await task.save();
      const subtaskId = task.subtasks[0]._id;

      const res = await request(app)
        .delete(`/api/tasks/${task._id}/subtasks/${subtaskId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.subtasks.length).toBe(0);
    });
  });

  // ─── Comments ───────────────────────────────────────────

  describe('Comment Operations', () => {
    it('adds a comment', async () => {
      const task = await createTestTask(userId);
      const res = await request(app)
        .post(`/api/tasks/${task._id}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'Great task!' });

      expect(res.status).toBe(200);
      expect(res.body.comments.length).toBe(1);
      expect(res.body.comments[0].text).toBe('Great task!');
    });

    it('deletes a comment', async () => {
      const task = await createTestTask(userId);
      task.comments.push({ userId, text: 'Comment to delete' });
      await task.save();
      const commentId = task.comments[0]._id;

      const res = await request(app)
        .delete(`/api/tasks/${task._id}/comments/${commentId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.comments.length).toBe(0);
    });
  });

  // ─── Timer ──────────────────────────────────────────────

  describe('Timer Operations', () => {
    it('starts a timer', async () => {
      const task = await createTestTask(userId);
      const res = await request(app)
        .post(`/api/tasks/${task._id}/timer/start`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.timeSessions.length).toBe(1);
      expect(res.body.timeSessions[0]).not.toHaveProperty('end');
    });

    it('stops a timer', async () => {
      const task = await createTestTask(userId);
      task.timeSessions.push({ start: new Date(Date.now() - 60000) });
      await task.save();

      const res = await request(app)
        .post(`/api/tasks/${task._id}/timer/stop`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.timeSessions[0]).toHaveProperty('end');
      expect(res.body.timeSessions[0]).toHaveProperty('duration');
    });
  });

  // ─── Favorites ──────────────────────────────────────────

  describe('Favorite Operations', () => {
    it('toggles favorite on', async () => {
      const task = await createTestTask(userId, { isFavorite: false });
      const res = await request(app)
        .post(`/api/tasks/${task._id}/favorite`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.isFavorite).toBe(true);
    });

    it('toggles favorite off', async () => {
      const task = await createTestTask(userId, { isFavorite: true });
      const res = await request(app)
        .post(`/api/tasks/${task._id}/favorite`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.isFavorite).toBe(false);
    });
  });

  // ─── Batch ──────────────────────────────────────────────

  describe('Batch Operations', () => {
    it('updates multiple tasks', async () => {
      const t1 = await createTestTask(userId, { status: 'pending' });
      const t2 = await createTestTask(userId, { status: 'pending' });

      const res = await request(app)
        .post('/api/tasks/batch')
        .set('Authorization', `Bearer ${token}`)
        .send({ taskIds: [t1._id, t2._id], updates: { status: 'completed' } });

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
      expect(res.body.every(t => t.status === 'completed')).toBe(true);
    });

    it('updates task order', async () => {
      const t1 = await createTestTask(userId, { order: 0 });
      const t2 = await createTestTask(userId, { order: 1 });

      const res = await request(app)
        .put('/api/tasks/order')
        .set('Authorization', `Bearer ${token}`)
        .send({ orders: [{ _id: t1._id, order: 2, status: 'pending' }, { _id: t2._id, order: 1, status: 'in-progress' }] });

      expect(res.status).toBe(200);
    });
  });

  // ─── Stats ──────────────────────────────────────────────

  describe('GET /api/tasks/stats', () => {
    it('returns task statistics', async () => {
      await createTestTask(userId, { status: 'pending' });
      await createTestTask(userId, { status: 'completed' });

      const res = await request(app)
        .get('/api/tasks/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total', 2);
      expect(res.body).toHaveProperty('byStatus');
      expect(res.body).toHaveProperty('byPriority');
      expect(res.body).toHaveProperty('overdue');
      expect(res.body).toHaveProperty('completedToday');
    });
  });

  // ─── Activity Log ───────────────────────────────────────

  describe('GET /api/tasks/activity', () => {
    it('returns activity log', async () => {
      // Create task via API to trigger activity logging
      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Activity test' });

      // Small delay to ensure activity is logged
      await new Promise(r => setTimeout(r, 100));

      const res = await request(app)
        .get('/api/tasks/activity')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body[0]).toHaveProperty('action');
    });
  });

  // ─── Notifications ──────────────────────────────────────

  describe('GET /api/notifications', () => {
    it('returns notifications', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('marks notification as read', async () => {
      const Notification = require('../models/Notification');
      const notif = await Notification.create({
        userId,
        type: 'system',
        title: 'Test',
        message: 'Test notification',
      });

      const res = await request(app)
        .put(`/api/notifications/${notif._id}/read`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.isRead).toBe(true);
    });

    it('marks all notifications as read', async () => {
      const Notification = require('../models/Notification');
      await Notification.create({ userId, type: 'system', title: '1', message: 'Notification 1' });
      await Notification.create({ userId, type: 'system', title: '2', message: 'Notification 2' });

      const res = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.modifiedCount).toBe(2);
    });
  });

  // ─── Export ──────────────────────────────────────────────

  describe('GET /api/tasks/export', () => {
    it('exports tasks as JSON', async () => {
      await createTestTask(userId, { title: 'Export test' });

      const res = await request(app)
        .get('/api/tasks/export?format=json')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toBe('Export test');
    });
  });
});
