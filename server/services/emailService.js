const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const FROM_EMAIL = 'TaskFlow <no-reply@example.com>';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const NODE_ENV = process.env.NODE_ENV || 'development';

let transporter = null;
let emailConfigured = false;

// Real SMTP transport is used when EMAIL_HOST is configured; otherwise we
// fall back to Ethereal (dev/test mode). Never log credentials.
const SMTP_CONFIGURED = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);

async function getTransporter() {
  if (transporter) return transporter;

  if (SMTP_CONFIGURED) {
    transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: Number(process.env.EMAIL_PORT) === 465,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    emailConfigured = true;
    logger.info('Email Service initialized with SMTP');
    return transporter;
  }

  // Create test account with a 10-second timeout so Ethereal network issues
  // don't hang the entire process forever.
  const account = await Promise.race([
    nodemailer.createTestAccount(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Ethereal account creation timed out (10s)')), 10000)
    ),
  ]);

  transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: account.user,
      pass: account.pass,
    },
  });

  emailConfigured = true;
  // Only log that Ethereal is active — never log credentials.
  logger.info('Email Service initialized with Ethereal (test mode)');

  return transporter;
}

const escapeHtml = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const baseTemplate = (title, content) => `
  <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
    <div style="text-align: center; margin-bottom: 24px;">
      <div style="display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 12px; background: #FACC15;">
        <span style="font-size: 24px;">✨</span>
      </div>
      <h1 style="margin: 16px 0 8px; font-size: 24px; color: #111827;">${title}</h1>
    </div>
    ${content}
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
    <p style="color: #9CA3AF; font-size: 12px; text-align: center;">
      If you didn't request this, you can safely ignore this email.
    </p>
  </div>
`;

const EMAIL_RE = /^\S+@\S+\.\S+$/;

// Header values must never carry CR/LF (header injection). Fold runs of
// CR/LF to a single space; subjects are additionally capped in length.
const sanitizeHeader = (val) => String(val ?? '').replace(/[\r\n]+/g, ' ');

const sendEmail = async (to, subject, html) => {
  // Accept a single address or an array; every address must look like an email.
  const recipients = Array.isArray(to) ? to : [to];
  const cleanRecipients = recipients.map((r) => sanitizeHeader(r).trim());
  const bad = cleanRecipients.find((r) => !EMAIL_RE.test(r));
  if (bad) {
    logger.warn('Email not sent: invalid recipient email address');
    throw new Error('Invalid recipient email address');
  }
  const cleanTo = Array.isArray(to) ? cleanRecipients : cleanRecipients[0];
  const cleanSubject = sanitizeHeader(subject).trim().slice(0, 200);

  if (!emailConfigured) {
    try {
      await getTransporter();
    } catch (err) {
      logger.debug('Email not sent: Ethereal account creation failed');
      return { id: 'mock', message: 'Email service not configured' };
    }
  }

  try {
    const transport = await getTransporter();
    const info = await transport.sendMail({
      from: FROM_EMAIL,
      to: cleanTo,
      subject: cleanSubject,
      html,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);

    logger.info('=================================================');
    logger.info('EMAIL SENT');
    logger.info(`To:        ${Array.isArray(cleanTo) ? cleanTo.join(', ') : cleanTo}`);
    logger.info(`Subject:   ${cleanSubject}`);
    logger.info(`Message ID: ${info.messageId}`);
    logger.info(`Preview URL: ${previewUrl}`);
    logger.info('=================================================');

    return { id: info.messageId, previewUrl };
  } catch (err) {
    logger.error('Failed to send email:');
    logger.error(`  error.name    : ${err.name}`);
    logger.error(`  error.message : ${err.message}`);
    logger.error(`  error.code    : ${err.code}`);
    logger.error(`  error.stack   : ${err.stack}`);
    throw err;
  }
};

exports.sendVerificationEmail = async (email, verificationToken) => {
  const verifyUrl = `${CLIENT_URL}/verify-email?token=${verificationToken}`;

  const html = baseTemplate(
    'Verify your email',
    `
    <p style="color: #6B7280; font-size: 14px; text-align: center; margin-bottom: 24px;">
      Thanks for signing up! Click the button below to verify your email address.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${escapeHtml(verifyUrl)}" style="display: inline-block; background: #FACC15; color: #1a1a23; padding: 12px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Verify Email
      </a>
    </div>
    <p style="color: #9CA3AF; font-size: 12px; text-align: center;">
      This link expires in 24 hours.
    </p>
    `
  );

  return sendEmail(email, 'Verify your TaskFlow email', html);
};

exports.sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = `${CLIENT_URL}/reset-password?token=${resetToken}`;

  const html = baseTemplate(
    'Reset your password',
    `
    <p style="color: #6B7280; font-size: 14px; text-align: center; margin-bottom: 24px;">
      Click the button below to reset your TaskFlow password. This link expires in 30 minutes.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${escapeHtml(resetUrl)}" style="display: inline-block; background: #FACC15; color: #1a1a23; padding: 12px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Reset Password
      </a>
    </div>
    `
  );

  return sendEmail(email, 'Reset your TaskFlow password', html);
};

exports.sendWelcomeEmail = async (email, name) => {
  const html = baseTemplate(
    `Welcome to TaskFlow!`,
    `
    <p style="color: #6B7280; font-size: 14px; text-align: center; margin-bottom: 24px;">
      Your account is all set up. Start organizing your tasks and boosting your productivity!
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${escapeHtml(CLIENT_URL)}" style="display: inline-block; background: #FACC15; color: #1a1a23; padding: 12px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Go to Dashboard
      </a>
    </div>
    `
  );

  return sendEmail(email, 'Welcome to TaskFlow!', html);
};

/**
 * Referral invite. The link carries the sender's referral code so attribution
 * happens at signup without the recipient having to type anything.
 */
exports.sendInviteEmail = async (email, senderName, link) => {
  const who = escapeHtml(senderName || 'Someone');
  const html = baseTemplate(
    `${who} invited you to TaskFlow`,
    `
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
      ${who} uses TaskFlow to plan their week — boards, a focus timer, and a weekly
      review that actually gets read. Your account is free to start.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${escapeHtml(link)}" style="display: inline-block; background: #cc785c; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
        Accept the invite
      </a>
    </div>
    <p style="color: #9CA3AF; font-size: 12px; text-align: center;">
      If you weren't expecting this, you can ignore the email — nothing was created for you.
    </p>
    `
  );

  return sendEmail(email, `${senderName || 'A friend'} invited you to TaskFlow`, html);
};

exports.sendNotificationEmail = async (email, userName, notification) => {
  const html = baseTemplate(
    'TaskFlow Notification',
    `
    <p style="color: #6B7280; font-size: 14px; line-height: 1.6;">${escapeHtml(notification.message)}</p>
    <p style="color: #9CA3AF; font-size: 12px; text-align: center; margin-top: 16px;">
      You received this because you have email notifications enabled in your TaskFlow settings.
    </p>
    `
  );

  return sendEmail(email, notification.title, html);
};

exports.isConfigured = () => emailConfigured || SMTP_CONFIGURED;

exports.getEmailStatus = () => {
  return {
    provider: SMTP_CONFIGURED ? 'smtp' : 'ethereal',
    configured: emailConfigured || SMTP_CONFIGURED,
    clientUrl: CLIENT_URL,
    environment: NODE_ENV,
  };
};

exports.sendEmail = sendEmail;
