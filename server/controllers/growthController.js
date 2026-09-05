const User = require('../models/User');
const Task = require('../models/Task');
const TaskTemplate = require('../models/TaskTemplate');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { validationResult } = require('express-validator');
const { PLANS, REFERRAL, getPlan, checkLimit } = require('../config/plans');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

const referralLink = (code) => `${CLIENT_URL}/?ref=${code}`;

/** Live = not soft-deleted. Completed tasks are history, not consumed quota. */
const countUsage = async (userId) => {
  const [activeTasks, templates] = await Promise.all([
    Task.countDocuments({ userId, deletedAt: null, status: { $ne: 'completed' } }),
    TaskTemplate.countDocuments({ userId }),
  ]);
  return { activeTasks, templates };
};

/**
 * GET /api/growth
 * One round trip for the whole growth surface: plan, live usage against the
 * plan's ceilings, the referral code (minted on first read), and invites sent.
 */
exports.getGrowth = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Lazily mint the code so accounts created before this feature get one
    // without a migration. Retry once on the (astronomically unlikely) clash.
    if (!user.referralCode) {
      user.ensureReferralCode();
      try {
        await user.save();
      } catch (err) {
        if (err?.code === 11000) {
          user.referralCode = undefined;
          user.ensureReferralCode();
          await user.save();
        } else {
          throw err;
        }
      }
    }

    const [usage, signups] = await Promise.all([
      countUsage(user._id),
      User.countDocuments({ referredBy: user._id }),
    ]);

    const planId = user.plan || 'free';
    res.json({
      plan: getPlan(planId),
      plans: Object.values(PLANS),
      usage: {
        activeTasks: checkLimit(planId, 'activeTasks', usage.activeTasks),
        templates: checkLimit(planId, 'templates', usage.templates),
      },
      referral: {
        code: user.referralCode,
        link: referralLink(user.referralCode),
        credits: user.referralCredits || 0,
        maxCredits: REFERRAL.maxCredits,
        signups,
      },
      invites: (user.invites || [])
        .slice()
        .sort((a, b) => new Date(b.invitedAt) - new Date(a.invitedAt))
        .map((i) => ({
          email: i.email,
          invitedAt: i.invitedAt,
          acceptedAt: i.acceptedAt,
          status: i.acceptedAt ? 'accepted' : 'pending',
        })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/growth/invite  { email }
 * Records the invite and sends it. Deliberately does not reveal whether the
 * address already has an account — that would turn the endpoint into a user
 * directory. The caller sees the same "invite sent" either way.
 */
exports.sendInvite = async (req, res, next) => {
  try {
    // The route's express-validator chain enforces isEmail + length first;
    // this stays as defense-in-depth if the chain is ever unwired.
    const chainErrors = validationResult(req);
    if (!chainErrors.isEmpty()) {
      return res.status(400).json({ message: chainErrors.array().map((e) => e.msg).join(', ') });
    }
    const raw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!/^\S+@\S+\.\S+$/.test(raw) || raw.length > 254) {
      return res.status(400).json({ message: 'Provide a valid email address' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (raw === user.email) {
      return res.status(400).json({ message: 'That is your own address' });
    }

    user.invites = user.invites || [];
    if (user.invites.some((i) => i.email === raw)) {
      return res.status(409).json({ message: 'You already invited that address' });
    }

    const pending = user.invites.filter((i) => !i.acceptedAt).length;
    if (pending >= REFERRAL.maxPendingInvites) {
      return res.status(429).json({
        message: `You can have ${REFERRAL.maxPendingInvites} invites outstanding at a time`,
      });
    }

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sentToday = user.invites.filter((i) => new Date(i.invitedAt) > dayAgo).length;
    if (sentToday >= REFERRAL.invitesPerDay) {
      return res.status(429).json({ message: 'Daily invite limit reached — try again tomorrow' });
    }

    if (!user.referralCode) user.ensureReferralCode();
    user.invites.push({ email: raw, invitedAt: new Date() });
    await user.save();

    // A failed send must not lose the recorded invite, so the email goes out
    // after the save and its failure is reported without a 500.
    let delivered = true;
    try {
      await emailService.sendInviteEmail(raw, user.name, referralLink(user.referralCode));
    } catch (err) {
      delivered = false;
      logger.warn('Invite email failed to send', { email: raw, error: err.message });
    }

    res.status(201).json({
      message: delivered ? 'Invite sent' : 'Invite recorded, but the email could not be delivered',
      delivered,
      invite: { email: raw, invitedAt: new Date(), status: 'pending' },
    });
  } catch (error) {
    next(error);
  }
};

/** DELETE /api/growth/invite/:email — drop a pending invite from the list. */
exports.revokeInvite = async (req, res, next) => {
  try {
    const chainErrors = validationResult(req);
    if (!chainErrors.isEmpty()) {
      return res.status(400).json({ message: chainErrors.array().map((e) => e.msg).join(', ') });
    }
    const email = String(req.params.email || '').trim().toLowerCase();
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const before = (user.invites || []).length;
    user.invites = (user.invites || []).filter((i) => !(i.email === email && !i.acceptedAt));
    if (user.invites.length === before) {
      return res.status(404).json({ message: 'No pending invite for that address' });
    }
    await user.save();
    res.json({ message: 'Invite revoked', email });
  } catch (error) {
    next(error);
  }
};

/**
 * Called from the register flow. Attributes a new signup to a referral code and
 * pays out a capped credit. Never throws into the signup path: a bad or unknown
 * code must not stop somebody creating an account.
 */
exports.attributeReferral = async (newUser, code) => {
  try {
    if (!code || typeof code !== 'string') return;
    const normalized = code.trim().toUpperCase().slice(0, 16);
    if (!/^[A-Z0-9]{4,16}$/.test(normalized)) return;

    const referrer = await User.findOne({ referralCode: normalized });
    if (!referrer || String(referrer._id) === String(newUser._id)) return;

    newUser.referredBy = referrer._id;
    await newUser.save();

    // Mark a matching invite accepted, and pay the credit up to the cap.
    const invite = (referrer.invites || []).find((i) => i.email === newUser.email && !i.acceptedAt);
    if (invite) {
      invite.acceptedAt = new Date();
      invite.acceptedBy = newUser._id;
    }
    referrer.referralCredits = Math.min(
      (referrer.referralCredits || 0) + REFERRAL.creditPerSignup,
      REFERRAL.maxCredits
    );
    await referrer.save();
  } catch (error) {
    logger.warn('Referral attribution failed', { error: error.message });
  }
};

/**
 * Guard for create endpoints. Returns null when the caller is within their
 * plan, or a `{status, body}` pair to send back.
 */
exports.enforceTaskLimit = async (user) => {
  const planId = user.plan || 'free';
  const limit = getPlan(planId).limits.activeTasks;
  if (limit === null || limit === undefined) return null;

  const used = await Task.countDocuments({
    userId: user._id,
    deletedAt: null,
    status: { $ne: 'completed' },
  });
  if (used < limit) return null;

  return {
    status: 402,
    body: {
      message: `The ${getPlan(planId).name} plan tops out at ${limit} active tasks. Complete or delete a few, or upgrade for unlimited.`,
      code: 'PLAN_LIMIT_REACHED',
      limit,
      used,
      resource: 'activeTasks',
    },
  };
};

exports.countUsage = countUsage;
