const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUser, createTestTask } = require('./helpers');

const app = createApp();

// Cross-user (IDOR/BOLA) matrix: everything created by A must be unreachable
// with B's token. Private-by-default; shared templates are the only
// intentional exception (tested separately in security.test.js).
describe('Cross-user authorization (IDOR matrix)', () => {
  let aToken, bToken, aId, bId;

  beforeEach(async () => {
    const a = await createTestUser({ email: 'alice@example.com', username: 'alice' });
    const b = await createTestUser({ email: 'bob@example.com', username: 'bob' });
    aToken = a.accessToken; bToken = b.accessToken;
    aId = a.user._id; bId = b.user._id;
  });

  const asA = (req) => req.set('Authorization', `Bearer ${aToken}`);
  const asB = (req) => req.set('Authorization', `Bearer ${bToken}`);

  describe('tasks', () => {
    it("cannot read another user's task", async () => {
      const task = await createTestTask(aId, { title: 'Alice secret' });
      const res = await asB(request(app).get(`/api/tasks/${task._id}`));
      expect(res.status).toBe(404);
    });

    it("cannot update another user's task", async () => {
      const task = await createTestTask(aId, { title: 'Alice secret' });
      const res = await asB(request(app).put(`/api/tasks/${task._id}`).send({ title: 'Pwned' }));
      expect(res.status).toBe(404);
      const fresh = await asA(request(app).get(`/api/tasks/${task._id}`));
      expect(fresh.body.title).toBe('Alice secret');
    });

    it("cannot delete another user's task", async () => {
      const task = await createTestTask(aId, { title: 'Alice secret' });
      const res = await asB(request(app).delete(`/api/tasks/${task._id}`));
      expect(res.status).toBe(404);
      const list = await asA(request(app).get('/api/tasks?paginate=false'));
      const arr = Array.isArray(list.body) ? list.body : list.body.data;
      expect(arr.some((t) => t._id.toString() === task._id.toString())).toBe(true);
    });

    it("cannot touch another user's subtasks or comments", async () => {
      const task = await createTestTask(aId, { title: 'Alice secret' });
      const id = task._id.toString();
      const sub = await asB(request(app).post(`/api/tasks/${id}/subtasks`).send({ title: 'x' }));
      expect([400, 404].includes(sub.status)).toBe(true);
      const cmt = await asB(request(app).post(`/api/tasks/${id}/comments`).send({ text: 'x' }));
      expect([400, 404].includes(cmt.status)).toBe(true);
    });

    it("cannot restore or purge another user's trash", async () => {
      const task = await createTestTask(aId, { title: 'Alice trashed' });
      await asA(request(app).delete(`/api/tasks/${task._id}`));
      const id = task._id.toString();
      expect((await asB(request(app).post(`/api/tasks/${id}/restore`))).status).toBe(404);
      expect((await asB(request(app).delete(`/api/tasks/${id}/purge`))).status).toBe(404);
    });

    it('lists only the caller’s own tasks', async () => {
      await createTestTask(aId, { title: 'Alice only' });
      await createTestTask(bId, { title: 'Bob only' });
      const res = await asB(request(app).get('/api/tasks?paginate=false'));
      const arr = Array.isArray(res.body) ? res.body : res.body.data;
      expect(arr.length).toBe(1);
      expect(arr[0].title).toBe('Bob only');
    });

    it("cannot scope activity to another user's task", async () => {
      const task = await createTestTask(aId, { title: 'Alice secret' });
      const res = await asB(request(app).get(`/api/tasks/activity?taskId=${task._id}`));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.not.arrayContaining([expect.objectContaining({ taskId: task._id.toString() })]));
    });
  });

  describe('notifications', () => {
    it("cannot read, mark, or delete another user's notification", async () => {
      // A assigns B a task → notification owned by B.
      const bIdStr = bId.toString();
      const created = await asA(
        request(app).post('/api/tasks').send({ title: 'For Bob', assignee: bIdStr })
      );
      expect(created.status).toBe(201);
      const listB = await asB(request(app).get('/api/notifications'));
      const items = listB.body.items || listB.body;
      expect(items.length).toBeGreaterThan(0);
      const nid = items[0]._id;
      // A (not the owner) gets 404 everywhere.
      expect((await asA(request(app).put(`/api/notifications/${nid}/read`))).status).toBe(404);
      expect((await asA(request(app).delete(`/api/notifications/${nid}`))).status).toBe(404);
      // B can read their own.
      expect((await asB(request(app).put(`/api/notifications/${nid}/read`))).status).toBe(200);
    });
  });

  describe('time tracking', () => {
    it("cannot start a timer on another user's task", async () => {
      const task = await createTestTask(aId, { title: 'Alice secret' });
      const res = await asB(request(app).post(`/api/time-tracking/${task._id}/start`));
      expect(res.status).toBe(404);
    });
  });

  describe('calendar', () => {
    it("cannot mint links for another user's task", async () => {
      const task = await createTestTask(aId, { title: 'Alice secret' });
      const res = await asB(request(app).get(`/api/calendar/links?taskId=${task._id}`));
      expect(res.status).toBe(404);
    });

    it('calendar export contains only the caller’s tasks', async () => {
      await createTestTask(aId, { title: 'Alice dated', dueDate: new Date() });
      const res = await asB(request(app).get('/api/calendar/export'));
      expect(res.status).toBe(200);
      expect(res.text).not.toMatch(/Alice dated/);
    });
  });

  describe('templates', () => {
    it("cannot read, apply, copy, edit, or delete another user's private template", async () => {
      const created = await asA(
        request(app).post('/api/templates').send({ title: 'Alice tpl', tasks: [{ title: 'x' }] })
      );
      expect([200, 201].includes(created.status)).toBe(true);
      const tid = (created.body.template || created.body)._id;
      // Convention (matches apply/copy/edit): 404 when missing, 403 for foreign.
      expect((await asB(request(app).get(`/api/templates/${tid}`))).status).toBe(403);
      expect((await asB(request(app).post(`/api/templates/${tid}/apply`))).status).toBe(403);
      expect((await asB(request(app).post(`/api/templates/${tid}/copy`))).status).toBe(403);
      expect((await asB(request(app).put(`/api/templates/${tid}`).send({ title: 'Pwned' }))).status).toBe(403);
      expect((await asB(request(app).delete(`/api/templates/${tid}`))).status).toBe(403);
    });
  });

  describe('growth, profile, ai-settings', () => {
    it('growth state is always the caller’s own', async () => {
      const resA = await asA(request(app).get('/api/growth'));
      const resB = await asB(request(app).get('/api/growth'));
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      expect(resA.body.referral.code).not.toBe(resB.body.referral.code);
    });

    it('profile endpoints return only the caller', async () => {
      const res = await asB(request(app).get('/api/auth/profile'));
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('bob@example.com');
    });

    it('ai-settings reveal nothing about other users', async () => {
      const res = await asB(request(app).get('/api/auth/ai-settings'));
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(/alice/i);
    });
  });
});
