const express = require('express');
const router = express.Router();
const { submitContact } = require('../controllers/contactController');
const { contactValidator } = require('../validators/contactValidators');
const validate = require('../validators/validate');
const { contactLimiter } = require('../middleware/rateLimiter');

// Public intake — no `protect` (logged-out visitors must reach support).
router.post('/', contactLimiter, contactValidator, validate, submitContact);

module.exports = router;
