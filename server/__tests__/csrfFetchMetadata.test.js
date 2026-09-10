// csrfFetchMetadata.test.js — Phase 6: Sec-Fetch-Site takes precedence over
// Origin/Referer for cookie-authenticated mutations.
const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUser } = require('./helpers');

const app = createApp();

async function registerAndGetCookies() {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const { user, accessToken } = await createTestUser({
    email: `fm${suffix}@example.com`,
    username: `fmuser${suffix}`,
  });
  // Cookie header carrying only the access cookie is enough for the CSRF
  // middleware's "cookie-authenticated" detection.
  return { cookie: `accessToken=${accessToken}`, accessToken, userId: user._id };
}

describe('Fetch Metadata CSRF defense', () => {
  it('blocks cookie-authenticated mutations with Sec-Fetch-Site: cross-site', async () => {
    const { cookie } = await registerAndGetCookies();
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .set('Sec-Fetch-Site', 'cross-site')
      .send({ title: 'evil' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/cross-site/i);
  });

  it('blocks sibling-subdomain (same-site) requests too', async () => {
    const { cookie } = await registerAndGetCookies();
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .set('Sec-Fetch-Site', 'same-site')
      .send({ title: 'evil' });
    expect(res.status).toBe(403);
  });

  it('allows same-origin requests without Origin headers', async () => {
    const { cookie } = await registerAndGetCookies();
    const res = await request(app)
      .post('/api/tasks')
      .set('Cookie', cookie)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ title: 'legit' });
    expect(res.status).toBe(201);
  });

  it('still allows requests with no Sec-Fetch headers (native clients via Bearer)', async () => {
    const { accessToken } = await registerAndGetCookies();
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'native client' });
    expect(res.status).toBe(201);
  });
});