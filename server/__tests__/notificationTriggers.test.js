const request = require('supertest');
const { createApp } = require('./setup');
const { createTestUser, createTestUserWithTokens, createTestTask } = require('./helpers');

const app = createApp();
const Notification = require('../models/Notification');
const { processDueDateNotifications } = require('../services/notificationScheduler');

describe('Notification Triggers', () => {
  let owner, ownerToken, assignee, assigneeToken;

  beforeEach(async () => {
    const ownerSetup = await createTestUserWithTokens({ email: 'owner@example.com', username: 'owner' });
    owner = ownerSetup.user;
    ownerToken = ownerSetup.accessToken;
    const assigneeSetup = await createTestUserWithTokens({ email: 'assignee@example.com', username: 'assignee' });
    assignee = assigneeSetup.user;
    assigneeToken = assigneeSetup.accessToken;
  });

  it('creates a notification when a task is assigned to someone else', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Assigned task', assignee: assignee._id.toString() });

    expect(res.status).toBe(201);

    const notif = await Notification.findOne({ userId: assignee._id, type: 'task_assigned' });
    expect(notif).toBeTruthy();
    expect(notif.relatedId.toString()).toBe(res.body._id);
  });

  it('does not notify when creating a task with no assignee', async () => {
    await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'My task' });

    const count = await Notification.countDocuments({});
    expect(count).toBe(0);
  });

  it('notifies the assignee on a status change', async () => {
    const task = await createTestTask(owner._id, { assignee: assignee._id });

    await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'in-progress' });

    const notif = await Notification.findOne({ userId: assignee._id, type: 'task_status_changed' });
    expect(notif).toBeTruthy();
  });

  it('does not notify the actor of their own status change', async () => {
    const task = await createTestTask(owner._id);

    await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'in-progress' });

    const count = await Notification.countDocuments({ userId: owner._id });
    expect(count).toBe(0);
  });

  it('notifies the assignee when the owner adds a comment', async () => {
    const task = await createTestTask(owner._id, { assignee: assignee._id });

    await request(app)
      .post(`/api/tasks/${task._id}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ text: 'Looks good' });

    const notif = await Notification.findOne({ userId: assignee._id, type: 'comment_added' });
    expect(notif).toBeTruthy();
  });

  it('does not notify the commenter of their own comment', async () => {
    const task = await createTestTask(owner._id);

    await request(app)
      .post(`/api/tasks/${task._id}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ text: 'My comment' });

    const count = await Notification.countDocuments({ userId: owner._id, type: 'comment_added' });
    expect(count).toBe(0);
  });

  it('notifies a mentioned user and not the commenter', async () => {
    const task = await createTestTask(owner._id);
    const mentionee = (await createTestUser({ email: 'ment@example.com', username: 'ment' })).user;

    await request(app)
      .post(`/api/tasks/${task._id}/comments`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ text: `Hey @${mentionee.username} please review` });

    const notif = await Notification.findOne({ userId: mentionee._id, type: 'mention' });
    expect(notif).toBeTruthy();

    const selfCount = await Notification.countDocuments({ userId: owner._id, type: 'mention' });
    expect(selfCount).toBe(0);
  });

  it('respects the notifications preference toggle', async () => {
    const muted = (await createTestUser({
      email: 'muted@example.com',
      username: 'muted',
      preferences: { notifications: false, emailNotifications: true, theme: 'dark' },
    })).user;

    await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'To muted user', assignee: muted._id.toString() });

    const count = await Notification.countDocuments({ userId: muted._id });
    expect(count).toBe(0);
  });
});

describe('Notification Scheduler', () => {
  let owner, token;

  beforeEach(async () => {
    const setup = await createTestUserWithTokens({ email: 'sched@example.com', username: 'sched' });
    owner = setup.user;
    token = setup.accessToken;
  });

  it('emits a due-soon notification for a task due within 24h', async () => {
    const due = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await createTestTask(owner._id, { dueDate: due });

    await processDueDateNotifications();

    const notif = await Notification.findOne({ userId: owner._id, type: 'task_due_soon' });
    expect(notif).toBeTruthy();
  });

  it('emits an overdue notification for a past-due open task', async () => {
    await createTestTask(owner._id, { dueDate: new Date(Date.now() - 2 * 60 * 60 * 1000) });

    await processDueDateNotifications();

    const notif = await Notification.findOne({ userId: owner._id, type: 'task_overdue' });
    expect(notif).toBeTruthy();
  });

  it('does not emit due-soon for a completed task', async () => {
    await createTestTask(owner._id, { dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000), status: 'completed' });

    await processDueDateNotifications();

    const count = await Notification.countDocuments({});
    expect(count).toBe(0);
  });

  it('does not duplicate reminders on repeated runs', async () => {
    await createTestTask(owner._id, { dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000) });

    await processDueDateNotifications();
    await processDueDateNotifications();

    const count = await Notification.countDocuments({ userId: owner._id, type: 'task_due_soon' });
    expect(count).toBe(1);
  });
});