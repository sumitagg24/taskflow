const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUser, createTestTask } = require('./helpers');

const app = createApp();

describe('Time Tracking pause/resume', () => {
  let token, userId, taskId;

  beforeEach(async () => {
    const setup = await createTestUser({ email: 'timer@example.com' });
    token = setup.accessToken;
    userId = setup.user._id;
    const task = await createTestTask(userId, { title: 'Timed task' });
    taskId = task._id.toString();
  });

  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  it('pauses and resumes, returning the pause duration', async () => {
    const started = await auth(request(app).post(`/api/time-tracking/${taskId}/start`).send({ notes: 'deep work' }));
    expect(started.status).toBe(201);

    const paused = await auth(request(app).post(`/api/time-tracking/${taskId}/pause`));
    expect(paused.status).toBe(200);
    expect(paused.body.session.isPaused).toBe(true);

    const resumed = await auth(request(app).post(`/api/time-tracking/${taskId}/resume`));
    expect(resumed.status).toBe(200);
    expect(resumed.body.session.isPaused).toBe(false);
    expect(typeof resumed.body.pauseDuration).toBe('number');

    const stopped = await auth(request(app).post(`/api/time-tracking/${taskId}/stop`));
    expect(stopped.status).toBe(200);
  });

  it('rejects resume when the timer is not paused', async () => {
    await auth(request(app).post(`/api/time-tracking/${taskId}/start`));
    const res = await auth(request(app).post(`/api/time-tracking/${taskId}/resume`));
    expect(res.status).toBe(400);
  });

  it('rejects a second pause while already paused', async () => {
    await auth(request(app).post(`/api/time-tracking/${taskId}/start`));
    await auth(request(app).post(`/api/time-tracking/${taskId}/pause`));
    const res = await auth(request(app).post(`/api/time-tracking/${taskId}/pause`));
    expect(res.status).toBe(400);
  });
});
