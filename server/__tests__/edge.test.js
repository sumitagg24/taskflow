const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUser, createTestTask } = require('./helpers');
const Task = require('../models/Task');

const app = createApp();

const p95of = (arr) => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
};

// ---------------------------------------------------------------------------
// SCALE: 150 tasks via direct model writes (bypasses the free-plan create
// cap, which only guards POST /api/tasks). Asserts generous-but-bounded
// latencies so a real cliff (full-collection scan without projection/limit)
// fails loudly, while normal in-memory variance does not.
// ---------------------------------------------------------------------------
describe('Edge: scale (150 tasks)', () => {
  it('serves paginated list, text search and insights within bounds', async () => {
    const { user, accessToken } = await createTestUser({
      email: 'scale@example.com',
      username: 'scaleuser',
      plan: 'pro',
    });
    const auth = `Bearer ${accessToken}`;

    const docs = Array.from({ length: 150 }, (_, i) => ({
      title: `Scale task ${String(i).padStart(3, '0')} alpha`,
      description: `Body ${i} searchable-target`,
      status: i % 5 === 0 ? 'completed' : 'pending',
      priority: 'medium',
      category: 'work',
      tags: ['scale'],
      userId: user._id,
    }));
    await Task.insertMany(docs);

    // Paginated list: 15 sequential page reads, p95 < 2s.
    const listDurations = [];
    for (let i = 0; i < 15; i += 1) {
      const t0 = Date.now();
      const res = await request(app)
        .get('/api/tasks?page=1&limit=50')
        .set('Authorization', auth);
      listDurations.push(Date.now() - t0);
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(150);
      expect(res.body.data).toHaveLength(50);
    }
    const listP95 = p95of(listDurations);
    const listMax = Math.max(...listDurations);
    console.log(`[scale] list n=150 runs=15 p95=${listP95}ms max=${listMax}ms durations=${listDurations.join(',')}`);
    expect(listP95).toBeLessThan(2000);

    // Text search latency: 5 runs, each < 2s, returns hits.
    const searchDurations = [];
    for (let i = 0; i < 5; i += 1) {
      const t0 = Date.now();
      const res = await request(app)
        .get('/api/tasks?search=Scale')
        .set('Authorization', auth);
      searchDurations.push(Date.now() - t0);
      expect(res.status).toBe(200);
      const rows = Array.isArray(res.body) ? res.body : res.body.data;
      expect(rows.length).toBeGreaterThan(0);
    }
    const searchP95 = p95of(searchDurations);
    const searchMax = Math.max(...searchDurations);
    console.log(`[scale] search n=150 runs=5 p95=${searchP95}ms max=${searchMax}ms durations=${searchDurations.join(',')}`);
    expect(searchP95).toBeLessThan(2000);

    // Insights latency: 3 runs, each < 5s. Endpoint already projects +
    // limits to 5000, so no cliff is expected — this locks that in.
    const insightsDurations = [];
    for (let i = 0; i < 3; i += 1) {
      const t0 = Date.now();
      const res = await request(app)
        .get('/api/tasks/insights?days=30')
        .set('Authorization', auth);
      insightsDurations.push(Date.now() - t0);
      expect(res.status).toBe(200);
      expect(res.body.velocity).toHaveLength(30);
    }
    const insightsMax = Math.max(...insightsDurations);
    console.log(`[scale] insights n=150 runs=3 max=${insightsMax}ms durations=${insightsDurations.join(',')}`);
    expect(insightsMax).toBeLessThan(5000);
  }, 60000);
});

// ---------------------------------------------------------------------------
// CONCURRENCY: last-write-wins without corruption.
// updateTask merges only provided scalar fields (whitelist loop) and only
// touches subtasks/dependencies when the key is present as an array, so
// scalar-only partial updates compose. Whole-array subtask replaces are
// intentionally last-write-wins (documented below); per-item writers should
// use POST /:id/subtasks which $push a single row.
// ---------------------------------------------------------------------------
describe('Edge: concurrency', () => {
  let token;
  let userId;

  beforeEach(async () => {
    const setup = await createTestUser({ email: 'edge@example.com', username: 'edgeuser' });
    token = setup.accessToken;
    userId = setup.user._id;
  });

  it('sequential partial updates compose (title + priority, arrays untouched)', async () => {
    const task = await createTestTask(userId, {
      title: 'Original',
      priority: 'medium',
      subtasks: [{ title: 'Keep me' }],
    });

    const r1 = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated title' });
    expect(r1.status).toBe(200);
    expect(r1.body.title).toBe('Updated title');
    expect(r1.body.priority).toBe('medium');

    const r2 = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ priority: 'high' });
    expect(r2.status).toBe(200);
    expect(r2.body.priority).toBe('high');

    const final = await request(app)
      .get(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(final.status).toBe(200);
    expect(final.body.title).toBe('Updated title');
    expect(final.body.priority).toBe('high');
    expect(final.body.subtasks).toHaveLength(1);
    expect(final.body.subtasks[0].title).toBe('Keep me');
  });

  it('rapid double status toggle ends consistent', async () => {
    const task = await createTestTask(userId, { title: 'Toggle me', status: 'pending' });

    const toCompleted = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed' });
    expect(toCompleted.status).toBe(200);
    expect(toCompleted.body.status).toBe('completed');

    const backToPending = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'pending' });
    expect(backToPending.status).toBe(200);
    expect(backToPending.body.status).toBe('pending');

    const final = await request(app)
      .get(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(final.status).toBe(200);
    expect(final.body.status).toBe('pending');
    expect(final.body.title).toBe('Toggle me');
  });

  it('simultaneous subtask add + comment add both persist', async () => {
    const task = await createTestTask(userId, { title: 'Concurrent target' });

    const [subRes, comRes] = await Promise.all([
      request(app)
        .post(`/api/tasks/${task._id}/subtasks`)
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Concurrent subtask' }),
      request(app)
        .post(`/api/tasks/${task._id}/comments`)
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'Concurrent comment' }),
    ]);
    expect(subRes.status).toBe(200);
    expect(comRes.status).toBe(200);

    const final = await request(app)
      .get(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(final.status).toBe(200);
    expect(final.body.subtasks.map((s) => s.title)).toContain('Concurrent subtask');
    expect(final.body.comments.map((c) => c.text)).toContain('Concurrent comment');
  });

  it('documents last-write-wins for concurrent whole-array subtask replaces', async () => {
    const task = await createTestTask(userId, { title: 'Array race' });

    const [a, b] = await Promise.all([
      request(app)
        .put(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subtasks: [{ title: 'Writer A' }] }),
      request(app)
        .put(`/api/tasks/${task._id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ subtasks: [{ title: 'Writer B' }] }),
    ]);
    // Mongoose optimistic concurrency on the `subtasks` array path means a
    // true overlap surfaces as a retryable VersionError (500) for the loser
    // instead of a silent merge; a staggered overlap resolves as plain
    // last-write-wins (both 200). Both outcomes are safe: no merge, no
    // corruption, and scalar-only updates never touch the array at all.
    const okCount = [a.status, b.status].filter((s) => s === 200).length;
    expect(okCount).toBeGreaterThanOrEqual(1);
    for (const r of [a, b]) {
      if (r.status !== 200) expect(r.status).toBe(500);
    }

    const final = await request(app)
      .get(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(final.status).toBe(200);
    // No merge, no corruption: exactly one writer's payload survives.
    expect(final.body.subtasks).toHaveLength(1);
    expect(['Writer A', 'Writer B']).toContain(final.body.subtasks[0].title);
  });
});
