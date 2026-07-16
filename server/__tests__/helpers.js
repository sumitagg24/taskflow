const User = require('../models/User');
const Task = require('../models/Task');
const { generateAccessToken, generateRefreshToken } = require('../middleware/auth');
const crypto = require('crypto');

const TEST_PASSWORD = 'StrongP@ss1';

async function createTestUser(overrides = {}) {
  const userData = {
    name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    password: TEST_PASSWORD,
    emailVerified: true,
    ...overrides,
  };

  const user = await User.create(userData);
  const accessToken = generateAccessToken(user._id);
  return { user, accessToken };
}

async function createTestUserWithTokens(overrides = {}) {
  const userData = {
    name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    password: TEST_PASSWORD,
    emailVerified: true,
    ...overrides,
  };

  const user = await User.create(userData);
  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);
  user.refreshToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await user.save();
  return { user, accessToken, refreshToken };
}

async function createTestTask(userId, overrides = {}) {
  const taskData = {
    title: 'Test Task',
    description: 'A task for testing',
    status: 'pending',
    priority: 'medium',
    userId,
    ...overrides,
  };

  return Task.create(taskData);
}

module.exports = { createTestUser, createTestUserWithTokens, createTestTask, TEST_PASSWORD };
