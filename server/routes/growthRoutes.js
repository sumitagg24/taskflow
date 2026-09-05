const express = require('express');
const router = express.Router();
const { getGrowth, sendInvite, revokeInvite } = require('../controllers/growthController');
const { protect } = require('../middleware/auth');
const { emailLimiter } = require('../middleware/rateLimiter');
const {
  inviteEmailValidator,
  revokeInviteValidator,
} = require('../validators/growthValidators');
const validate = require('../validators/validate');

/**
 * @swagger
 * /api/growth:
 *   get:
 *     summary: Plan, usage against plan limits, referral code and invites
 *     tags: [Growth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Growth surface payload }
 */
router.get('/', protect, getGrowth);

/**
 * @swagger
 * /api/growth/invite:
 *   post:
 *     summary: Invite somebody by email using your referral link
 *     tags: [Growth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Invite recorded }
 *       400: { description: Invalid email }
 *       409: { description: Already invited }
 *       429: { description: Invite limit reached }
 */
router.post('/invite', protect, emailLimiter, inviteEmailValidator, validate, sendInvite);

/**
 * @swagger
 * /api/growth/invite/{email}:
 *   delete:
 *     summary: Revoke a pending invite
 *     tags: [Growth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Invite revoked }
 *       404: { description: No pending invite for that address }
 */
router.delete('/invite/:email', protect, revokeInviteValidator, validate, revokeInvite);

module.exports = router;
