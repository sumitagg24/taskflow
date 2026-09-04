const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUser } = require('./helpers');
const User = require('../models/User');
const Task = require('../models/Task');
const emailService = require('../services/emailService');
const { getPlan, REFERRAL } = require('../config/plans');

const app = createApp();

// Invites go out over SMTP in production; the suite asserts on the call, not on
// a real delivery.
jest.spyOn(emailService, 'sendInviteEmail').mockResolvedValue({ messageId: 'test' });

describe('Growth Endpoints', () => {
  let token, user;

  beforeEach(async () => {
    emailService.sendInviteEmail.mockClear();
    const setup = await createTestUser({ email: 'owner@example.com', username: 'owner' });
    token = setup.accessToken;
    user = setup.user;
  });

  describe('GET /api/growth', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/growth');
      expect(res.status).toBe(401);
    });

    it('returns the plan, its limits and live usage', async () => {
      await Task.create([
        { title: 'Live one', userId: user._id, status: 'pending' },
        { title: 'Live two', userId: user._id, status: 'in-progress' },
        { title: 'Done', userId: user._id, status: 'completed' },
        { title: 'Trashed', userId: user._id, status: 'pending', deletedAt: new Date() },
      ]);

      const res = await request(app).get('/api/growth').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.plan.id).toBe('free');
      expect(res.body.plan.limits.activeTasks).toBe(getPlan('free').limits.activeTasks);
      // Completed and trashed rows must not consume quota.
      expect(res.body.usage.activeTasks.used).toBe(2);
      expect(res.body.usage.activeTasks.allowed).toBe(true);
      expect(res.body.plans.map((p) => p.id)).toEqual(['free', 'pro', 'team']);
    });

    it('mints a referral code on first read and reuses it afterwards', async () => {
      const first = await request(app).get('/api/growth').set('Authorization', `Bearer ${token}`);
      expect(first.body.referral.code).toMatch(/^[A-Z0-9]{8}$/);
      expect(first.body.referral.link).toContain(first.body.referral.code);

      const second = await request(app).get('/api/growth').set('Authorization', `Bearer ${token}`);
      expect(second.body.referral.code).toBe(first.body.referral.code);
    });

    it('counts referred signups', async () => {
      const seeded = await User.findById(user._id);
      seeded.ensureReferralCode();
      await seeded.save();
      await createTestUser({ email: 'ref1@example.com', username: 'ref1', referredBy: user._id });

      const res = await request(app).get('/api/growth').set('Authorization', `Bearer ${token}`);
      expect(res.body.referral.signups).toBe(1);
    });
  });

  describe('POST /api/growth/invite', () => {
    it('records the invite and sends the email with the referral link', async () => {
      const res = await request(app)
        .post('/api/growth/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'Friend@Example.com' });

      expect(res.status).toBe(201);
      expect(res.body.delivered).toBe(true);
      expect(res.body.invite.email).toBe('friend@example.com');

      const stored = await User.findById(user._id);
      expect(stored.invites).toHaveLength(1);
      expect(stored.invites[0].email).toBe('friend@example.com');
      expect(stored.invites[0].acceptedAt).toBeNull();

      expect(emailService.sendInviteEmail).toHaveBeenCalledTimes(1);
      const [to, senderName, link] = emailService.sendInviteEmail.mock.calls[0];
      expect(to).toBe('friend@example.com');
      expect(senderName).toBe(user.name);
      expect(link).toContain(stored.referralCode);
    });

    it('rejects a malformed address', async () => {
      const res = await request(app)
        .post('/api/growth/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'not-an-email' });

      expect(res.status).toBe(400);
      expect(emailService.sendInviteEmail).not.toHaveBeenCalled();
    });

    it('refuses to invite yourself', async () => {
      const res = await request(app)
        .post('/api/growth/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'owner@example.com' });

      expect(res.status).toBe(400);
    });

    it('refuses a duplicate invite', async () => {
      await request(app)
        .post('/api/growth/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'dupe@example.com' });

      const res = await request(app)
        .post('/api/growth/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'dupe@example.com' });

      expect(res.status).toBe(409);
      const stored = await User.findById(user._id);
      expect(stored.invites).toHaveLength(1);
    });

    it('keeps the invite recorded when delivery fails', async () => {
      emailService.sendInviteEmail.mockRejectedValueOnce(new Error('SMTP down'));

      const res = await request(app)
        .post('/api/growth/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'unreachable@example.com' });

      expect(res.status).toBe(201);
      expect(res.body.delivered).toBe(false);
      const stored = await User.findById(user._id);
      expect(stored.invites).toHaveLength(1);
    });

    it('caps how many invites can go out in a day', async () => {
      const seeded = await User.findById(user._id);
      seeded.invites = Array.from({ length: REFERRAL.invitesPerDay }, (_, i) => ({
        email: `bulk${i}@example.com`,
        invitedAt: new Date(),
      }));
      await seeded.save();

      const res = await request(app)
        .post('/api/growth/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'onemore@example.com' });

      expect(res.status).toBe(429);
    });
  });

  describe('DELETE /api/growth/invite/:email', () => {
    it('revokes a pending invite', async () => {
      await request(app)
        .post('/api/growth/invite')
        .set('Authorization', `Bearer ${token}`)
        .send({ email: 'revoke@example.com' });

      const res = await request(app)
        .delete('/api/growth/invite/revoke@example.com')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      const stored = await User.findById(user._id);
      expect(stored.invites).toHaveLength(0);
    });

    it('404s for an address that was never invited', async () => {
      const res = await request(app)
        .delete('/api/growth/invite/stranger@example.com')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });

    it('will not revoke an invite that was already accepted', async () => {
      const seeded = await User.findById(user._id);
      seeded.invites = [{ email: 'joined@example.com', invitedAt: new Date(), acceptedAt: new Date() }];
      await seeded.save();

      const res = await request(app)
        .delete('/api/growth/invite/joined@example.com')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      const after = await User.findById(user._id);
      expect(after.invites).toHaveLength(1);
    });
  });

  describe('referral attribution at signup', () => {
    const signup = (body) => request(app).post('/api/auth/register').send({
      name: 'New Person',
      username: 'newperson',
      email: 'new@example.com',
      password: 'StrongP@ss1',
      ...body,
    });

    it('credits the referrer and marks a matching invite accepted', async () => {
      const seeded = await User.findById(user._id);
      const code = seeded.ensureReferralCode();
      seeded.invites = [{ email: 'new@example.com', invitedAt: new Date() }];
      await seeded.save();

      const res = await signup({ referralCode: code });
      expect(res.status).toBe(201);

      const referrer = await User.findById(user._id);
      expect(referrer.referralCredits).toBe(REFERRAL.creditPerSignup);
      expect(referrer.invites[0].acceptedAt).not.toBeNull();

      const created = await User.findOne({ email: 'new@example.com' });
      expect(String(created.referredBy)).toBe(String(user._id));
    });

    it('is case-insensitive about the code', async () => {
      const seeded = await User.findById(user._id);
      const code = seeded.ensureReferralCode();
      await seeded.save();

      const res = await signup({ referralCode: code.toLowerCase() });
      expect(res.status).toBe(201);

      const created = await User.findOne({ email: 'new@example.com' });
      expect(String(created.referredBy)).toBe(String(user._id));
    });

    it('still creates the account when the code is unknown', async () => {
      const res = await signup({ referralCode: 'ZZZZZZZZ' });
      expect(res.status).toBe(201);

      const created = await User.findOne({ email: 'new@example.com' });
      expect(created.referredBy).toBeNull();
    });

    it('ignores a malformed code without failing the signup', async () => {
      const res = await signup({ referralCode: '<script>alert(1)</script>' });
      expect(res.status).toBe(201);

      const created = await User.findOne({ email: 'new@example.com' });
      expect(created.referredBy).toBeNull();
    });

    it('caps referral credits', async () => {
      const seeded = await User.findById(user._id);
      const code = seeded.ensureReferralCode();
      seeded.referralCredits = REFERRAL.maxCredits;
      await seeded.save();

      await signup({ referralCode: code });

      const referrer = await User.findById(user._id);
      expect(referrer.referralCredits).toBe(REFERRAL.maxCredits);
    });
  });

  describe('plan limits on task creation', () => {
    it('blocks a create once the free plan ceiling is reached', async () => {
      const limit = getPlan('free').limits.activeTasks;
      await Task.insertMany(
        Array.from({ length: limit }, (_, i) => ({
          title: `Filler ${i}`,
          userId: user._id,
          status: 'pending',
        }))
      );

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'One too many' });

      expect(res.status).toBe(402);
      expect(res.body.code).toBe('PLAN_LIMIT_REACHED');
      expect(res.body.limit).toBe(limit);
      expect(await Task.countDocuments({ userId: user._id })).toBe(limit);
    });

    it('does not count completed or trashed tasks toward the ceiling', async () => {
      const limit = getPlan('free').limits.activeTasks;
      await Task.insertMany([
        ...Array.from({ length: limit - 1 }, (_, i) => ({
          title: `Filler ${i}`,
          userId: user._id,
          status: 'pending',
        })),
        { title: 'Done', userId: user._id, status: 'completed' },
        { title: 'Trashed', userId: user._id, status: 'pending', deletedAt: new Date() },
      ]);

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Fits exactly' });

      expect(res.status).toBe(201);
    });

    it('lets a Pro account past the free ceiling', async () => {
      await User.findByIdAndUpdate(user._id, { plan: 'pro' });
      const limit = getPlan('free').limits.activeTasks;
      await Task.insertMany(
        Array.from({ length: limit }, (_, i) => ({
          title: `Filler ${i}`,
          userId: user._id,
          status: 'pending',
        }))
      );

      const res = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'Unlimited' });

      expect(res.status).toBe(201);
    });
  });

  describe('plan is not client-writable', () => {
    it('ignores a plan upgrade smuggled through the profile endpoint', async () => {
      const res = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Renamed', plan: 'team' });

      expect(res.status).toBe(200);
      const stored = await User.findById(user._id);
      expect(stored.plan).toBe('free');
    });
  });
});
