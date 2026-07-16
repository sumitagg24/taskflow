const express = require('express');
const router = express.Router();
const {
  getTasks, getTask, createTask, updateTask, deleteTask,
  addSubtask, updateSubtask, deleteSubtask,
  addComment, deleteComment,
  startTimer, stopTimer,
  toggleFavorite, updateOrder, batchUpdate,
  getStats, getActivityLog,
  exportTasks,
} = require('../controllers/taskController');
const {
  createTaskValidator, updateTaskValidator, idValidator,
  subtaskIdValidator, commentIdValidator,
} = require('../validators/taskValidators');
const { protect } = require('../middleware/auth');

// All routes require auth
router.use(protect);

// Stats & logs
router.get('/stats', getStats);
router.get('/activity', getActivityLog);

// Export
router.get('/export', exportTasks);

// Batch operations
router.post('/batch', batchUpdate);
router.put('/order', updateOrder);

// Standard CRUD
router.route('/')
  .get(getTasks)
  .post(createTaskValidator, createTask);

router.route('/:id')
  .get(idValidator, getTask)
  .put(idValidator.concat(updateTaskValidator), updateTask)
  .delete(idValidator, deleteTask);

// Subtasks
router.post('/:id/subtasks', idValidator, addSubtask);
router.put('/:id/subtasks/:subtaskId', subtaskIdValidator, updateSubtask);
router.delete('/:id/subtasks/:subtaskId', subtaskIdValidator, deleteSubtask);

// Comments
router.post('/:id/comments', idValidator, addComment);
router.delete('/:id/comments/:commentId', commentIdValidator, deleteComment);

// Time tracking
router.post('/:id/timer/start', idValidator, startTimer);
router.post('/:id/timer/stop', idValidator, stopTimer);

// Favorites
router.post('/:id/favorite', idValidator, toggleFavorite);

module.exports = router;
