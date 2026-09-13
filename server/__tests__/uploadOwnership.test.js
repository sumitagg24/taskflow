const request = require('supertest');
const { createApp } = require('./setup');

let app;
let Upload;
const User = () => require('../models/User');
const Task = () => require('../models/Task');
const { generateAccessToken } = require('../middleware/auth');

jest.setTimeout(120_000);

const makeUser = async (email, username) => {
  const user = await User().create({
    name: `User ${username}`,
    username,
    email,
    password: 'Str0ng$Pass1!',
    emailVerified: true,
    authProvider: 'local',
  });
  return { user, token: generateAccessToken(user._id) };
};

describe('deleteComment authorization (IDOR)', () => {
  beforeAll(() => {
    app = createApp();
  });

  test('non-author non-owner cannot delete a comment (owner-moderation closed)', async () => {
    const owner = await makeUser('delc-owner@example.com', 'delcowner');
    const commenter = await makeUser('delc-author@example.com', 'delcauthor');
    const third = await makeUser('delc-third@example.com', 'delcthird');

    const task = await Task().create({
      title: 'Commented task',
      userId: owner.user._id,
      assignee: commenter.user._id,
      comments: [{ userId: commenter.user._id, text: 'my comment' }],
    });
    const commentId = task.comments[0]._id;

    // The assignee (third party with read access) may NOT delete someone
    // else's comment on a task they don't own.
    const res = await request(app)
      .delete(`/api/tasks/${task._id}/comments/${commentId}`)
      .set('Authorization', `Bearer ${third.token}`);
    expect(res.status).toBe(404); // task not visible to them

    // Owner may NOT delete the assignee's comment either (not their own).
    const resOwner = await request(app)
      .delete(`/api/tasks/${task._id}/comments/${commentId}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(resOwner.status).toBe(403);
    expect(resOwner.body.message).toMatch(/own comments/i);

    // The author CAN delete their own comment.
    const resAuthor = await request(app)
      .delete(`/api/tasks/${task._id}/comments/${commentId}`)
      .set('Authorization', `Bearer ${commenter.token}`);
    expect(resAuthor.status).toBe(200);
    const after = await Task().findById(task._id);
    expect(after.comments.id(commentId)).toBeNull();
  });
});

describe('Upload ownership records', () => {
  beforeAll(() => {
    app = createApp();
    Upload = require('../models/Upload');
  });

  test('model accepts an ownership record with uploader + state', async () => {
    const { user } = await makeUser('upload-model@example.com', 'uploadmodel');
    const rec = await Upload.create({
      filename: 'attachment-123.png',
      uploadedBy: user._id,
      state: 'orphan',
      mimeType: 'image/png',
      size: 1234,
    });
    expect(rec._id).toBeTruthy();
    const found = await Upload.findOne({ filename: 'attachment-123.png' }).lean();
    expect(String(found.uploadedBy)).toBe(String(user._id));
    expect(found.state).toBe('orphan');
  });
});

describe('authorizeAttachments rejects foreign upload descriptors', () => {
  beforeAll(() => {
    app = createApp();
    Upload = require('../models/Upload');
  });

  test('PUT /tasks/:id with a descriptor uploaded by another user → 403 and task untouched', async () => {
    const alice = await makeUser('alice-att@example.com', 'aliceatt');
    const mallory = await makeUser('mallory-att@example.com', 'malloryatt');

    const task = await Task().create({ title: 'Alice task', userId: alice.user._id });

    // Mallory uploads a file (record exists, uploadedBy = Mallory).
    await Upload.create({
      filename: 'attachment-secret.pdf',
      uploadedBy: mallory.user._id,
      state: 'orphan',
    });

    // Alice tries to attach Mallory's file to her task.
    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        attachments: [
          { filename: 'attachment-secret.pdf', path: '/uploads/attachment-secret.pdf', mimeType: 'application/pdf', size: 10 },
        ],
      });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not uploaded by you/i);

    const after = await Task().findById(task._id);
    expect(after.attachments || []).toHaveLength(0);
  });

  test('attaching your own upload succeeds and flips state to attached', async () => {
    const alice = await makeUser('alice-own@example.com', 'aliceown');
    const task = await Task().create({ title: 'Alice own task', userId: alice.user._id });

    await Upload.create({
      filename: 'attachment-mine.png',
      uploadedBy: alice.user._id,
      state: 'orphan',
    });

    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        attachments: [
          { filename: 'attachment-mine.png', path: '/uploads/attachment-mine.png', mimeType: 'image/png', size: 42 },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.attachments).toHaveLength(1);

    const rec = await Upload.findOne({ filename: 'attachment-mine.png' }).lean();
    expect(rec.state).toBe('attached');
  });

  test('legacy descriptor with no Upload record is admitted once and recorded', async () => {
    const alice = await makeUser('alice-legacy@example.com', 'alicelegacy');
    const task = await Task().create({ title: 'Legacy task', userId: alice.user._id });

    const res = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({
        attachments: [
          { filename: 'attachment-legacy.txt', path: '/uploads/attachment-legacy.txt', mimeType: 'text/plain', size: 7 },
        ],
      });
    expect(res.status).toBe(200);

    // Ownership record minted at first admission.
    const rec = await Upload.findOne({ filename: 'attachment-legacy.txt' }).lean();
    expect(rec).toBeTruthy();
    expect(String(rec.uploadedBy)).toBe(String(alice.user._id));
    expect(rec.state).toBe('attached');

    // A second user can no longer graft the same file.
    const mallory = await makeUser('mallory-legacy@example.com', 'mallorylegacy');
    const task2 = await Task().create({ title: 'Mallory task', userId: mallory.user._id });
    const res2 = await request(app)
      .put(`/api/tasks/${task2._id}`)
      .set('Authorization', `Bearer ${mallory.token}`)
      .send({
        attachments: [
          { filename: 'attachment-legacy.txt', path: '/uploads/attachment-legacy.txt', mimeType: 'text/plain', size: 7 },
        ],
      });
    expect(res2.status).toBe(403);
  });
});
