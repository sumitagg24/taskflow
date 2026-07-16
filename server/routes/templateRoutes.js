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

// All routes require auth
router.use(protect);

// Shared templates
router.get('/shared', getSharedTemplates);

// Standard CRUD
router.route('/')
  .get(getTemplates)
  .post(createTemplate);

router.route('/:id')
  .get(getTemplate)
  .put(updateTemplate)
  .delete(deleteTemplate);

// Apply template (copy task data)
router.post('/:id/apply', applyTemplate);

// Copy template
router.post('/:id/copy', copyTemplate);

module.exports = router;
