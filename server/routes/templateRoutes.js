const express = require('express');
const router = express.Router();
const {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplate,
  copyTemplate,
  getSharedTemplates,
} = require('../controllers/templateController');
const { protect } = require('../middleware/auth');
const {
  templateIdValidator,
  createTemplateValidator,
  updateTemplateValidator,
} = require('../validators/templateValidators');
const validate = require('../validators/validate');

// All routes require auth
router.use(protect);

// Phase 6 starters — MUST sit before `/:id` so "starters" is never parsed as an id.
const { getStarters, applyStarter } = require('../controllers/dailyController');
router.get('/starters', getStarters);
router.post('/starters/:key/apply', applyStarter);

// Shared templates
router.get('/shared', getSharedTemplates);

// Standard CRUD
router.route('/')
  .get(getTemplates)
  .post(createTemplateValidator, validate, createTemplate);

router.route('/:id')
  .get(templateIdValidator, validate, getTemplate)
  .put(templateIdValidator.concat(updateTemplateValidator), validate, updateTemplate)
  .delete(templateIdValidator, validate, deleteTemplate);

// Apply template (copy task data)
router.post('/:id/apply', templateIdValidator, validate, applyTemplate);

// Copy template
router.post('/:id/copy', templateIdValidator, validate, copyTemplate);

module.exports = router;
