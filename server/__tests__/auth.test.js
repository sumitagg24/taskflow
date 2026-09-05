const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUser, createTestUserWithTokens, TEST_PASSWORD } = require('./helpers');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Mock google-auth-library to avoid network calls at import time
jest.mock('google-auth-library', () => {
  const mockVerifyIdToken = jest.fn();
  class MockOAuth2Client {
    constructor() {}
    verifyIdToken(...args) { return mockVerifyIdToken(...args); }
  }
  // Allow tests to control the mock behavior
  MockOAuth2Client._mockVerify = mockVerifyIdToken;
  return { OAuth2Client: MockOAuth2Client };
});

const { OAuth2Client } = require('google-auth-library');

const app = createApp();
const JWT_SECRET = process.env.JWT_SECRET;

const validRegister = {
  name: 'New User',
  username: 'newuser',
  email: 'new@example.com',
  password: 'StrongP@ss1',
};

// ========================================================================
// REGISTER
// ========================================================================
describe('POST /api/auth/register', () => {
  it('registers a new user and returns tokens', async () => {
    const res = await request(app).post('/api/auth/register').send(validRegister);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user).toMatchObject({ name: 'New User', email: 'new@example.com' });
    expect(res.body.message).toMatch(/verify/i);
  });

  it('rejects duplicate email', async () => {
    await createTestUser({ email: 'dupe@example.com' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validRegister, email: 'dupe@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already registered/i);
  });

  it('rejects missing name', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'x@y.com', password: 'StrongP@ss1' });
    expect(res.status).toBe(400);
  });

  it('rejects short password (<8 chars)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', username: 'testuser', email: 'x@y.com', password: 'Ab1$' });
    expect(res.status).toBe(400);
  });

  it('rejects password without uppercase', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', username: 'testuser', email: 'x@y.com', password: 'lowercase1$' });
    expect(res.status).toBe(400);
  });

  it('rejects password without lowercase', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', username: 'testuser', email: 'x@y.com', password: 'UPPERCASE1$' });
    expect(res.status).toBe(400);
  });

  it('rejects password without number', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', username: 'testuser', email: 'x@y.com', password: 'NoNumber$!' });
    expect(res.status).toBe(400);
  });

  it('rejects password without special char', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test', username: 'testuser', email: 'x@y.com', password: 'NoSpecial1' });
    expect(res.status).toBe(400);
  });

  it('rejects common passwords', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test', username: 'testuser', email: 'x@y.com', password: 'Password1$' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/common/i);
  });

  it('rejects invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'X', username: 'testuser', email: 'notanemail', password: 'StrongP@ss1' });
    expect(res.status).toBe(400);
  });

  it('hashes password in database', async () => {
    await request(app).post('/api/auth/register').send(validRegister);
    const user = await User.findOne({ email: validRegister.email }).select('+password');
    expect(user.password).not.toBe(validRegister.password);
    expect(user.password).toMatch(/^\$2[abxy]\$\d{2}\$/);
  });

  it('sets authProvider to local', async () => {
    await request(app).post('/api/auth/register').send(validRegister);
    const user = await User.findOne({ email: validRegister.email });
    expect(user.authProvider).toBe('local');
  });
});

// ========================================================================
// LOGIN
// ========================================================================
describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await createTestUser({ email: 'login@example.com' });
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'login@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe('login@example.com');
  });

  it('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'login@example.com', password: 'WrongP@ss1' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('rejects non-existent email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'nobody@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('rejects google-only accounts', async () => {
    await User.create({
      name: 'Google User', username: 'googleuser', email: 'google@example.com',
      authProvider: 'google', googleId: '12345', emailVerified: true,
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'google@example.com', password: 'SomeP@ss1' });
    expect(res.status).toBe(401);
  });

  it('rejects unverified email', async () => {
    await User.create({
      name: 'Unverified', username: 'unverified', email: 'unverified@example.com', password: TEST_PASSWORD, emailVerified: false,
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'unverified@example.com', password: TEST_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('access token contains proper JWT claims', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'login@example.com', password: TEST_PASSWORD });
    const decoded = jwt.decode(res.body.accessToken);
    expect(decoded).toHaveProperty('sub');
    expect(decoded).toHaveProperty('iat');
    expect(decoded).toHaveProperty('exp');
    expect(decoded).toHaveProperty('jti');
    expect(decoded.token_type).toBe('access');
  });
});

// ========================================================================
// PROFILE
// ========================================================================
describe('GET /api/auth/profile', () => {
  it('returns profile with valid token', async () => {
    const { accessToken } = await createTestUser({ email: 'prof@example.com' });
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('prof@example.com');
    expect(res.body.user).not.toHaveProperty('password');
    expect(res.body.user).not.toHaveProperty('refreshToken');
  });

  it('rejects without token', async () => {
    const res = await request(app).get('/api/auth/profile');
    expect(res.status).toBe(401);
  });

  it('rejects with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });

  it('rejects with refresh token (wrong type)', async () => {
    const { user } = await createTestUser({ email: 'typetest@example.com' });
    const refreshJwt = jwt.sign(
      { sub: user._id.toString(), id: user._id, token_type: 'refresh', jti: crypto.randomUUID(), iat: Math.floor(Date.now() / 1000) },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${refreshJwt}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/token type/i);
  });

  it('rejects expired token', async () => {
    const expired = jwt.sign(
      { sub: 'abc', id: 'abc', token_type: 'access', jti: crypto.randomUUID(), iat: Math.floor(Date.now() / 1000) - 3600 },
      process.env.JWT_SECRET,
      { expiresIn: '0s' }
    );
    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });
});

// ========================================================================
// UPDATE PROFILE
// ========================================================================
describe('PUT /api/auth/profile', () => {
  it('updates name and bio', async () => {
    const { accessToken } = await createTestUser({ email: 'upd@example.com' });
    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Updated', bio: 'Bio here' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated');
    expect(res.body.user.bio).toBe('Bio here');
  });

  it('rejects without auth', async () => {
    const res = await request(app).put('/api/auth/profile').send({ name: 'X' });
    expect(res.status).toBe(401);
  });
});

// ========================================================================
// EMAIL VERIFICATION
// ========================================================================
describe('POST /api/auth/verify-email', () => {
  it('verifies email with valid token', async () => {
    const user = await User.create({ name: 'V', username: 'verifyuser', email: 'verify@example.com', password: TEST_PASSWORD, emailVerified: false });
    const token = user.createEmailVerificationToken();
    await user.save();
    const res = await request(app).post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/verified/i);
    const updated = await User.findById(user._id);
    expect(updated.emailVerified).toBe(true);
  });

  it('handles already verified users gracefully', async () => {
    const user = await User.create({ name: 'V', username: 'alreadyuser', email: 'already@example.com', password: TEST_PASSWORD, emailVerified: true });
    const token = user.createEmailVerificationToken();
    await user.save();
    const res = await request(app).post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already verified/i);
  });

  it('rejects invalid token', async () => {
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'invalid-token' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('rejects expired token', async () => {
    const user = await User.create({ name: 'V', username: 'expireduser', email: 'expired@example.com', password: TEST_PASSWORD, emailVerified: false });
    const token = user.createEmailVerificationToken();
    user.emailVerificationExpires = Date.now() - 1000;
    await user.save();
    const res = await request(app).post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid|expired/i);
  });
});

// ========================================================================
// RESEND VERIFICATION
// ========================================================================
describe('POST /api/auth/resend-verification', () => {
  it('returns generic message (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'nonexistent@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sent/i);
  });

  it('returns generic message for already verified', async () => {
    await createTestUser({ email: 'verified@example.com', emailVerified: true });
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .send({ email: 'verified@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sent/i);
  });
});

// ========================================================================
// FORGOT / RESET PASSWORD
// ========================================================================
describe('POST /api/auth/forgot-password', () => {
  it('returns generic message for registered email', async () => {
    await createTestUser({ email: 'forgot@example.com' });
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'forgot@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset/i);
  });

  it('returns generic message for unregistered email (no enumeration)', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset/i);
  });

  it('returns generic message for google accounts (no enumeration)', async () => {
    await User.create({
      name: 'G', username: 'googleuser', email: 'google@example.com', authProvider: 'google', googleId: '123', emailVerified: true,
    });
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'google@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reset/i);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('resets password with valid token', async () => {
    const user = await User.create({ name: 'R', username: 'resetuser', email: 'reset@example.com', password: TEST_PASSWORD, emailVerified: true });
    const token = user.createPasswordResetToken();
    await user.save();
    const newPass = 'NewStr0ng$!';
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: newPass });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/success/i);
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'reset@example.com', password: newPass });
    expect(loginRes.status).toBe(200);
  });

  it('invalidates refresh tokens on password reset', async () => {
    const { user, refreshToken } = await createTestUserWithTokens({ email: 'resetrt@example.com' });
    const token = user.createPasswordResetToken();
    await user.save();
    await request(app).post('/api/auth/reset-password').send({ token, password: 'NewStr0ng$!' });
    const refreshRes = await request(app).post('/api/auth/refresh-token').send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  it('rejects invalid token', async () => {
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'invalid', password: 'NewStr0ng$!' });
    expect(res.status).toBe(400);
  });

  it('rejects expired token', async () => {
    const user = await User.create({ name: 'R', username: 'reseteuser', email: 'resete@example.com', password: TEST_PASSWORD, emailVerified: true });
    const token = user.createPasswordResetToken();
    user.resetPasswordExpires = Date.now() - 1000;
    await user.save();
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'NewStr0ng$!' });
    expect(res.status).toBe(400);
  });

  it('rejects common password', async () => {
    const user = await User.create({ name: 'R', username: 'resetcuser', email: 'resetcp@example.com', password: TEST_PASSWORD, emailVerified: true });
    const token = user.createPasswordResetToken();
    await user.save();
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'Password1$' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/common/i);
  });

  it('cannot reuse the same token twice', async () => {
    const user = await User.create({ name: 'R', username: 'reuseuser', email: 'reuse@example.com', password: TEST_PASSWORD, emailVerified: true });
    const token = user.createPasswordResetToken();
    await user.save();
    await request(app).post('/api/auth/reset-password').send({ token, password: 'NewStr0ng$!' });
    const res = await request(app).post('/api/auth/reset-password').send({ token, password: 'An0th3r$!' });
    expect(res.status).toBe(400);
  });
});

// ========================================================================
// REFRESH TOKEN
// ========================================================================
describe('POST /api/auth/refresh-token', () => {
  it('returns new token pair with valid refresh token', async () => {
    const { accessToken, refreshToken } = await createTestUserWithTokens({ email: 'refresh@example.com' });
    const res = await request(app).post('/api/auth/refresh-token').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.accessToken).not.toBe(accessToken);
    expect(res.body.refreshToken).not.toBe(refreshToken);
  });

  it('rejects invalid refresh token', async () => {
    const res = await request(app).post('/api/auth/refresh-token').send({ refreshToken: 'invalid-token' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('REFRESH_INVALID');
  });

  it('detects token reuse (old token after rotation)', async () => {
    const { refreshToken } = await createTestUserWithTokens({ email: 'reuse@example.com' });
    const first = await request(app).post('/api/auth/refresh-token').send({ refreshToken });
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/auth/refresh-token').send({ refreshToken });
    expect(second.status).toBe(401);
  });

  it('invalidates all sessions on reuse', async () => {
    const { refreshToken } = await createTestUserWithTokens({ email: 'reuse2@example.com' });
    const first = await request(app).post('/api/auth/refresh-token').send({ refreshToken });
    expect(first.status).toBe(200);
    const second = await request(app).post('/api/auth/refresh-token').send({ refreshToken });
    expect(second.status).toBe(401);
    const third = await request(app).post('/api/auth/refresh-token').send({ refreshToken: first.body.refreshToken });
    expect(third.status).toBe(401);
  });

  it('rejects access token used as refresh token', async () => {
    const { accessToken } = await createTestUserWithTokens({ email: 'wrongtype@example.com' });
    const res = await request(app).post('/api/auth/refresh-token').send({ refreshToken: accessToken });
    expect(res.status).toBe(401);
  });

  it('rejects expired refresh token', async () => {
    const expired = jwt.sign(
      { sub: 'abc', id: 'abc', token_type: 'refresh', jti: crypto.randomUUID(), iat: Math.floor(Date.now() / 1000) - 86400 },
      process.env.JWT_SECRET,
      { expiresIn: '0s' }
    );
    const res = await request(app).post('/api/auth/refresh-token').send({ refreshToken: expired });
    expect(res.status).toBe(401);
  });
});

// ========================================================================
// CHANGE PASSWORD
// ========================================================================
describe('POST /api/auth/change-password', () => {
  it('changes password with valid current password', async () => {
    const { accessToken } = await createTestUser({ email: 'changepw@example.com' });
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewStr0ng$!' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/success/i);
  });

  it('rejects wrong current password', async () => {
    const { accessToken } = await createTestUser({ email: 'wrongpw@example.com' });
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'WrongP@ss1', newPassword: 'NewStr0ng$!' });
    expect(res.status).toBe(401);
  });

  it('rejects when current and new password are the same', async () => {
    const { accessToken } = await createTestUser({ email: 'samepw@example.com' });
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: TEST_PASSWORD });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/different/i);
  });

  it('rejects common new password', async () => {
    const { accessToken } = await createTestUser({ email: 'commonpw@example.com' });
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'Password1$' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/common/i);
  });

  it('rejects for google accounts', async () => {
    const googleUser = await User.create({
      name: 'G', username: 'googlepw', email: 'googlepw@example.com', authProvider: 'google', googleId: '123', emailVerified: true,
    });
    const { generateAccessToken } = require('../middleware/auth');
    const accessToken = generateAccessToken(googleUser._id);
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'anything', newPassword: 'NewStr0ng$!' });
    expect(res.status).toBe(400);
  });

  it('rejects without auth', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewStr0ng$!' });
    expect(res.status).toBe(401);
  });

  it('revokes pre-change access tokens (passwordChangedAt)', async () => {
    const { user } = await createTestUser({ email: 'pcat@example.com' });
    // Token with an iat clearly in the past, so the guard deterministically
    // treats it as issued before the password change.
    const oldAccessToken = jwt.sign(
      { sub: user._id.toString(), id: user._id, type: 'access', token_type: 'access', iat: Math.floor(Date.now() / 1000) - 60, jti: crypto.randomUUID() },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${oldAccessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewStr0ng$!' });
    expect(res.status).toBe(200);

    const after = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${oldAccessToken}`);
    expect(after.status).toBe(401);
  });

  it('change-password returns a usable fresh token pair', async () => {
    const { accessToken } = await createTestUser({ email: 'cpfresh@example.com' });

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: TEST_PASSWORD, newPassword: 'NewStr0ng$!' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();

    const profile = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${res.body.accessToken}`);
    expect(profile.status).toBe(200);
  });

  it('revokes pre-change access tokens on password reset', async () => {
    const { user } = await createTestUserWithTokens({ email: 'pcareset@example.com' });
    const token = user.createPasswordResetToken();
    await user.save();

    // Issue an access token with an iat clearly in the past, then reset.
    const oldAccessToken = jwt.sign(
      { sub: user._id.toString(), id: user._id, type: 'access', token_type: 'access', iat: Math.floor(Date.now() / 1000) - 60, jti: crypto.randomUUID() },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    await request(app).post('/api/auth/reset-password').send({ token, password: 'NewStr0ng$!' });

    const after = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${oldAccessToken}`);
    expect(after.status).toBe(401);
  });
});

// ========================================================================
// GOOGLE OAUTH
// ========================================================================
describe('POST /api/auth/google', () => {
  const mockGooglePayload = (overrides = {}) => ({
    sub: 'google-123',
    email: 'googleuser@example.com',
    name: 'Google User',
    picture: 'https://example.com/pic.jpg',
    email_verified: true,
    ...overrides,
  });

  beforeEach(() => {
    OAuth2Client._mockVerify.mockReset();
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  it('returns 500 if GOOGLE_CLIENT_ID is not configured', async () => {
    const original = process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID;

    delete require.cache[require.resolve('../controllers/authController')];
    const res = await request(app).post('/api/auth/google').send({ credential: 'some-token' });

    expect(res.status).toBe(500);

    process.env.GOOGLE_CLIENT_ID = original;
    delete require.cache[require.resolve('../controllers/authController')];
  });

  it('rejects missing credential', async () => {
    const res = await request(app).post('/api/auth/google').send({});
    expect(res.status).toBe(400);
  });

  it('successfully signs in a new Google user', async () => {
    OAuth2Client._mockVerify.mockResolvedValue({
      getPayload: () => mockGooglePayload(),
    });
    const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user).toMatchObject({
      email: 'googleuser@example.com', name: 'Google User', authProvider: 'google', emailVerified: true,
    });
    const user = await User.findOne({ email: 'googleuser@example.com' });
    expect(user).toBeTruthy();
    expect(user.authProvider).toBe('google');
    expect(user.googleId).toBe('google-123');
  });

  it('rejects invalid ID token', async () => {
    OAuth2Client._mockVerify.mockRejectedValue(new Error('Invalid token'));
    const res = await request(app).post('/api/auth/google').send({ credential: 'invalid-token' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('rejects expired ID token', async () => {
    OAuth2Client._mockVerify.mockRejectedValue(new Error('Token expired'));
    const res = await request(app).post('/api/auth/google').send({ credential: 'expired-token' });
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid/i);
  });

  it('rejects when email is not verified', async () => {
    OAuth2Client._mockVerify.mockResolvedValue({
      getPayload: () => mockGooglePayload({ email_verified: false }),
    });
    const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not verified/i);
  });

  it('rejects when ID token payload has no email', async () => {
    OAuth2Client._mockVerify.mockResolvedValue({
      getPayload: () => mockGooglePayload({ email: undefined }),
    });
    const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email address/i);
  });

  it('rejects auto-linking when a local account exists with the same email', async () => {
    OAuth2Client._mockVerify.mockResolvedValue({
      getPayload: () => mockGooglePayload(),
    });
    await createTestUser({ email: 'googleuser@example.com', authProvider: 'local' });
    const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already registered with a password/i);
    const user = await User.findOne({ email: 'googleuser@example.com' });
    expect(user.googleId).toBeUndefined();
  });

  it('allows login when Google account already exists', async () => {
    OAuth2Client._mockVerify.mockResolvedValue({
      getPayload: () => mockGooglePayload(),
    });
    await User.create({
      name: 'Existing Google User', username: 'existinggoogle', email: 'googleuser@example.com',
      authProvider: 'google', googleId: 'google-123', emailVerified: true,
    });
    const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('googleuser@example.com');
  });

  it('rejects when a different Google account claims the same email', async () => {
    OAuth2Client._mockVerify.mockResolvedValue({
      getPayload: () => mockGooglePayload(),
    });
    await User.create({
      name: 'Other Google User', username: 'othergoogle', email: 'googleuser@example.com',
      authProvider: 'google', googleId: 'different-google-id', emailVerified: true,
    });
    const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already associated with another account/i);
  });

  it('updates avatar picture on subsequent Google logins', async () => {
    OAuth2Client._mockVerify.mockResolvedValue({
      getPayload: () => mockGooglePayload({ picture: 'https://example.com/new-pic.jpg' }),
    });
    await User.create({
      name: 'Google User', username: 'googleavatar', email: 'googleuser@example.com',
      authProvider: 'google', googleId: 'google-123', emailVerified: true, avatar: '',
    });
    const res = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });
    expect(res.status).toBe(200);
    expect(res.body.user.avatar).toBe('https://example.com/new-pic.jpg');
    const user = await User.findOne({ email: 'googleuser@example.com' });
    expect(user.avatar).toBe('https://example.com/new-pic.jpg');
  });
});

// ========================================================================
// LOGOUT
// ========================================================================
describe('POST /api/auth/logout', () => {
  it('logs out and invalidates refresh token', async () => {
    const { user, accessToken, refreshToken } = await createTestUserWithTokens({ email: 'logout@example.com' });
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/logged out/i);
    const updatedUser = await User.findById(user._id);
    expect(updatedUser.refreshToken).toBeUndefined();
  });

  it('allows logout without token', async () => {
    const res = await request(app).post('/api/auth/logout').send({});
    expect(res.status).toBe(200);
  });

  it('invalidates refresh token even with expired access token', async () => {
    const { user, refreshToken } = await createTestUserWithTokens({ email: 'expired-logout@example.com' });
    const expiredAccessToken = jwt.sign({ id: user._id, type: 'access' }, JWT_SECRET, { expiresIn: '-1s' });
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${expiredAccessToken}`)
      .send({ refreshToken });
    expect(res.status).toBe(200);
    const updatedUser = await User.findById(user._id);
    expect(updatedUser.refreshToken).toBeUndefined();
  });

  it('denies a logged-out access token on next use', async () => {
    const { accessToken, refreshToken } = await createTestUserWithTokens({ email: 'logout-deny@example.com' });
    const before = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(before.status).toBe(200);
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logoutRes.status).toBe(200);
    const after = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(after.status).toBe(401);
  });

  it('a fresh login pair still works after an unrelated logout', async () => {
    const first = await createTestUserWithTokens({ email: 'logout-first@example.com', username: 'logoutfirst' });
    const second = await createTestUserWithTokens({ email: 'logout-second@example.com', username: 'logoutsecond' });
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .send({ refreshToken: first.refreshToken });
    expect(logoutRes.status).toBe(200);
    const profile = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${second.accessToken}`);
    expect(profile.status).toBe(200);
    const refreshRes = await request(app)
      .post('/api/auth/refresh-token')
      .send({ refreshToken: second.refreshToken });
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('accessToken');
  });
});

// ========================================================================
// FOCUS TIME
// ========================================================================
describe('POST /api/auth/focus-time', () => {
  it('updates focus time', async () => {
    const { accessToken } = await createTestUser({ email: 'focus@example.com' });
    const res = await request(app)
      .post('/api/auth/focus-time')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ minutes: 30 });
    expect(res.status).toBe(200);
    expect(res.body.focusTimeToday).toBe(30);
  });

  it('accumulates focus time', async () => {
    const { accessToken } = await createTestUser({ email: 'focus2@example.com' });
    await request(app)
      .post('/api/auth/focus-time')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ minutes: 15 });
    const res = await request(app)
      .post('/api/auth/focus-time')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ minutes: 10 });
    expect(res.status).toBe(200);
    expect(res.body.focusTimeToday).toBe(25);
  });
});

// ========================================================================
// ERROR HANDLING
// ========================================================================
describe('Error handling', () => {
  it('returns 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/auth/nonexistent-route');
    expect(res.status).toBe(404);
  });

  it('returns structured errors', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'x@y.com', password: 'StrongP@ss1' });
    expect(res.body).toHaveProperty('message');
    expect(res.status).toBe(401);
  });
});
