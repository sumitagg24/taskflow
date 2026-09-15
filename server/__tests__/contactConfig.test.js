// sendContactMessage against the REAL email module — no jest.mock here.
// The SUPPORT_EMAIL-missing path throws before any transport is built, so
// this never touches the network.
process.env.NODE_ENV = 'test';

const { sendContactMessage, canDeliver } = require('../services/emailService');

describe('contact delivery configuration', () => {
  it('throws 503 when SUPPORT_EMAIL is unset', async () => {
    const saved = process.env.SUPPORT_EMAIL;
    delete process.env.SUPPORT_EMAIL;
    try {
      await expect(
        sendContactMessage({
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          subject: 'Export seems stuck',
          message: 'My calendar export has been spinning. Please help!',
        })
      ).rejects.toMatchObject({ statusCode: 503 });
    } finally {
      if (saved === undefined) delete process.env.SUPPORT_EMAIL;
      else process.env.SUPPORT_EMAIL = saved;
    }
  });

  it('throws 503 when SUPPORT_EMAIL is malformed', async () => {
    const saved = process.env.SUPPORT_EMAIL;
    process.env.SUPPORT_EMAIL = 'not-an-email';
    try {
      await expect(
        sendContactMessage({
          name: 'Ada',
          email: 'ada@example.com',
          subject: 'Help please',
          message: 'Something is broken, please help me fix it.',
        })
      ).rejects.toMatchObject({ statusCode: 503 });
    } finally {
      if (saved === undefined) delete process.env.SUPPORT_EMAIL;
      else process.env.SUPPORT_EMAIL = saved;
    }
  });

  it('reports undeliverable without a real transport in test', () => {
    expect(canDeliver()).toBe(false);
  });
});
