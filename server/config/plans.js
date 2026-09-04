/**
 * Plan definitions and usage limits.
 *
 * Limits live here rather than in the controllers so the enforcement point and
 * the number shown in the UI can never drift apart: `GET /api/growth` serves
 * this same object to the client.
 *
 * `null` means unlimited. Every limit is a *ceiling on live rows* (soft-deleted
 * tasks don't count), so emptying the Trash frees quota the way a user expects.
 */
const PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    blurb: 'Everything you need to run your own week.',
    limits: {
      activeTasks: 100,
      templates: 3,
      savedViews: 3,
      aiRequestsPerDay: 20,
      attachmentsPerTask: 3,
    },
    features: [
      'Unlimited completed history',
      'Kanban, calendar and focus timer',
      'Command palette and saved views',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 8,
    blurb: 'For people who live in their task list.',
    limits: {
      activeTasks: null,
      templates: 50,
      savedViews: 25,
      aiRequestsPerDay: 500,
      attachmentsPerTask: 20,
    },
    features: [
      'Unlimited active tasks',
      'Recurring tasks and dependencies',
      'Insights, streaks and weekly review',
      'Priority AI breakdown',
    ],
  },
  team: {
    id: 'team',
    name: 'Team',
    price: 12,
    blurb: 'Shared boards for a small crew.',
    limits: {
      activeTasks: null,
      templates: null,
      savedViews: null,
      aiRequestsPerDay: 2000,
      attachmentsPerTask: 50,
    },
    features: [
      'Everything in Pro',
      'Shared boards and assignees',
      'Team digest and activity feed',
    ],
  },
};

const DEFAULT_PLAN = 'free';

/** Referral payout, capped so the loop cannot be farmed indefinitely. */
const REFERRAL = {
  creditPerSignup: 1, // months of Pro
  maxCredits: 12,
  maxPendingInvites: 25,
  invitesPerDay: 10,
};

const getPlan = (id) => PLANS[id] || PLANS[DEFAULT_PLAN];

/**
 * @returns {{allowed: boolean, limit: number|null, used: number, remaining: number|null}}
 */
const checkLimit = (planId, key, used) => {
  const limit = getPlan(planId).limits[key];
  if (limit === null || limit === undefined) {
    return { allowed: true, limit: null, used, remaining: null };
  }
  return { allowed: used < limit, limit, used, remaining: Math.max(0, limit - used) };
};

module.exports = { PLANS, DEFAULT_PLAN, REFERRAL, getPlan, checkLimit };
