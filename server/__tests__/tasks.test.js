const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUser, createTestTask } = require('./helpers');
const Task = require('../models/Task');

const app = createApp();

describe('Tasks Endpoints', () => {
  let token, userId;
  const listOf = (body) => (Array.isArray(body) ? body : body.data);

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
      expect(Array.isArray(listOf(res.body))).toBe(true);
      expect(listOf(res.body).length).toBe(0);
    });

    it('returns user tasks', async () => {
      await createTestTask(userId, { title: 'Task 1' });
      await createTestTask(userId, { title: 'Task 2' });

      const res = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(listOf(res.body).length).toBe(2);
    });

    it('filters by status', async () => {
      await createTestTask(userId, { title: 'Pending', status: 'pending' });
      await createTestTask(userId, { title: 'Completed', status: 'completed' });

      const res = await request(app)
        .get('/api/tasks?status=completed')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(listOf(res.body).length).toBe(1);
      expect(listOf(res.body)[0].title).toBe('Completed');
    });

    it('searches by title', async () => {
      await createTestTask(userId, { title: 'Buy groceries' });
      await createTestTask(userId, { title: 'Write report' });

      const res = await request(app)
        .get('/api/tasks?search=groceries')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(listOf(res.body).length).toBe(1);
      expect(listOf(res.body)[0].title).toMatch(/groceries/i);
    });

    it('finds tasks via text search', async () => {
      await createTestTask(userId, { title: 'Quarterly planning session' });

      const res = await request(app)
        .get('/api/tasks?search=planning')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(listOf(res.body).length).toBe(1);
    });

    it('falls back to partial matching for short queries', async () => {
      await createTestTask(userId, { title: 'Buy groceries' });

      const res = await request(app)
        .get('/api/tasks?search=gro')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(listOf(res.body).length).toBe(1);
    });
  });

  describe('tasks indexes', () => {
    it('has covering indexes for list sorts', async () => {
      const indexes = await Task.listIndexes();
      const keys = indexes.map((idx) => Object.keys(idx.key).join(','));
      expect(keys).toEqual(
        expect.arrayContaining([
          'userId,deletedAt,updatedAt',
          'userId,deletedAt,createdAt',
          'userId,deletedAt,title',
        ])
      );
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
    it('soft-deletes a task and hides it from the list', async () => {
      const task = await createTestTask(userId);
      const res = await request(app)
        .delete(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/trash/i);
      expect(res.body.deletedAt).toBeTruthy();
      expect(res.body.retentionDays).toBeGreaterThan(0);

      // The row survives, but every live read path must ignore it.
      const stillThere = await Task.findById(task._id);
      expect(stillThere).not.toBeNull();
      expect(stillThere.deletedAt).toBeInstanceOf(Date);

      const list = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${token}`);
      expect(listOf(list.body).map((t) => t._id)).not.toContain(String(task._id));

      const single = await request(app)
        .get(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(single.status).toBe(404);
    });

    it('excludes trashed tasks from stats', async () => {
      const keep = await createTestTask(userId, { title: 'Keep' });
      const drop = await createTestTask(userId, { title: 'Drop' });
      await request(app).delete(`/api/tasks/${drop._id}`).set('Authorization', `Bearer ${token}`);

      const res = await request(app).get('/api/tasks/stats').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.trashed).toBe(1);
      expect(keep._id).toBeTruthy();
    });
  });

  // ─── Trash ──────────────────────────────────────────────

  describe('Trash lifecycle', () => {
    const trash = async (id) =>
      request(app).delete(`/api/tasks/${id}`).set('Authorization', `Bearer ${token}`);

    it('lists trashed tasks with a purge date', async () => {
      const task = await createTestTask(userId, { title: 'Trashed one' });
      await trash(task._id);

      const res = await request(app).get('/api/tasks/trash').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.retentionDays).toBeGreaterThan(0);
      expect(res.body.tasks).toHaveLength(1);
      expect(res.body.tasks[0].title).toBe('Trashed one');
      expect(new Date(res.body.tasks[0].purgeAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('restores a task back into the live list', async () => {
      const task = await createTestTask(userId);
      await trash(task._id);

      const res = await request(app)
        .post(`/api/tasks/${task._id}/restore`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body._id).toBe(String(task._id));

      const list = await request(app).get('/api/tasks').set('Authorization', `Bearer ${token}`);
      expect(listOf(list.body).map((t) => t._id)).toContain(String(task._id));
    });

    it('refuses to restore a task that was never trashed', async () => {
      const task = await createTestTask(userId);
      const res = await request(app)
        .post(`/api/tasks/${task._id}/restore`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('purges a trashed task for good', async () => {
      const task = await createTestTask(userId);
      await trash(task._id);

      const res = await request(app)
        .delete(`/api/tasks/${task._id}/purge`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(await Task.findById(task._id)).toBeNull();
    });

    it('refuses to purge a live task', async () => {
      const task = await createTestTask(userId);
      const res = await request(app)
        .delete(`/api/tasks/${task._id}/purge`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(await Task.findById(task._id)).not.toBeNull();
    });

    it('empties the trash without touching live tasks', async () => {
      const live = await createTestTask(userId, { title: 'Live' });
      const a = await createTestTask(userId, { title: 'A' });
      const b = await createTestTask(userId, { title: 'B' });
      await trash(a._id);
      await trash(b._id);

      const res = await request(app).delete('/api/tasks/trash').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.deletedCount).toBe(2);
      expect(await Task.findById(live._id)).not.toBeNull();
    });

    it('does not expose another user\'s trash', async () => {
      const other = await createTestUser({
        email: 'other-trash@example.com',
        username: 'othertrash',
      });
      const theirTask = await createTestTask(other.user._id);
      await request(app)
        .delete(`/api/tasks/${theirTask._id}`)
        .set('Authorization', `Bearer ${other.accessToken}`);

      const res = await request(app).get('/api/tasks/trash').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.tasks).toHaveLength(0);
    });
  });

  // ─── Subtasks ───────────────────────────────────────────

  describe('Subtask Operations', () => {
    it('persists subtasks sent with the create payload', async () => {
      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({
          title: 'Composed in the form',
          subtasks: [
            { title: 'First step', completed: false },
            { title: 'Second step', completed: true },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.subtasks).toHaveLength(2);
      expect(res.body.subtasks[0].title).toBe('First step');
      expect(res.body.subtasks[1].completed).toBe(true);
    });

    it('replaces subtasks on update and drops blank rows', async () => {
      const task = await createTestTask(userId);
      const res = await request(app)
        .put(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subtasks: [{ title: 'Kept' }, { title: '   ' }, { completed: true }] });

      expect(res.status).toBe(200);
      expect(res.body.subtasks).toHaveLength(1);
      expect(res.body.subtasks[0].title).toBe('Kept');
    });

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

  // ─── Dependencies ───────────────────────────────────────

  describe('Dependency Operations', () => {
    it('links a dependency and returns it populated', async () => {
      const blocker = await createTestTask(userId, { title: 'Ship the API' });
      const task = await createTestTask(userId, { title: 'Ship the UI' });

      const res = await request(app)
        .put(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependencies: [{ taskId: blocker._id, type: 'blocked-by' }] });

      expect(res.status).toBe(200);
      expect(res.body.dependencies).toHaveLength(1);
      expect(res.body.dependencies[0].type).toBe('blocked-by');
      expect(res.body.dependencies[0].taskId.title).toBe('Ship the API');
    });

    it('drops a dependency on a task the caller does not own', async () => {
      const other = await createTestUser({ email: 'dep@example.com', username: 'depuser' });
      const theirTask = await createTestTask(other.user._id, { title: 'Secret roadmap' });
      const task = await createTestTask(userId);

      const res = await request(app)
        .put(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependencies: [{ taskId: theirTask._id, type: 'blocked-by' }] });

      expect(res.status).toBe(200);
      expect(res.body.dependencies).toHaveLength(0);
    });

    it('refuses to let a task depend on itself', async () => {
      const task = await createTestTask(userId);
      const res = await request(app)
        .put(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ dependencies: [{ taskId: task._id, type: 'blocks' }] });

      expect(res.status).toBe(200);
      expect(res.body.dependencies).toHaveLength(0);
    });

    it('de-duplicates repeated links to the same task', async () => {
      const blocker = await createTestTask(userId);
      const task = await createTestTask(userId);

      const res = await request(app)
        .put(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          dependencies: [
            { taskId: blocker._id, type: 'blocked-by' },
            { taskId: blocker._id, type: 'blocks' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.dependencies).toHaveLength(1);
    });

    it('ignores malformed dependency ids instead of failing the save', async () => {
      const task = await createTestTask(userId);
      const res = await request(app)
        .put(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Still saves', dependencies: [{ taskId: 'not-an-id' }, null, 'garbage'] });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Still saves');
      expect(res.body.dependencies).toHaveLength(0);
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

    it('scopes the feed to one task when given a taskId', async () => {
      const mine = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Scoped activity' });
      await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Some other task' });

      await new Promise(r => setTimeout(r, 100));

      const res = await request(app)
        .get('/api/tasks/activity')
        .query({ taskId: mine.body._id })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      // Nothing from any other task leaks into a task-scoped read.
      expect(res.body.every(e => String(e.taskId) === String(mine.body._id))).toBe(true);
    });

    it('rejects a malformed taskId rather than casting it', async () => {
      const res = await request(app)
        .get('/api/tasks/activity')
        .query({ taskId: 'not-an-id' })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
    });

    it('caps the page size', async () => {
      const res = await request(app)
        .get('/api/tasks/activity')
        .query({ limit: 5000 })
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeLessThanOrEqual(100);
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
