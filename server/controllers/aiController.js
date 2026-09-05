const Task = require('../models/Task');
const aiService = require('../services/aiService');
const { validationResult } = require('express-validator');

const MAX_AI_INPUT = 4000;

// Route validator chains enforce shape first; these guards keep the same 400s
// even if a chain is ever unwired.
const rejectInvalidChain = (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ message: errors.array().map((e) => e.msg).join(', ') });
    return true;
  }
  return false;
};

const tooLong = (val) => typeof val === 'string' && val.length > MAX_AI_INPUT;

/**
 * Get user's AI settings from the request.
 * Returns the user object with aiApiKey included.
 */
async function getUserAiSettings(req) {
  // req.user is populated by auth middleware and contains _id, aiProvider, aiModel, aiSettings
  // We need to fetch aiApiKey separately since it has select: false
  const User = require('../models/User');
  const user = await User.findById(req.user._id).select('+aiApiKey').lean();
  return {
    aiProvider: user.aiProvider,
    aiApiKey: user.aiApiKey,
    aiModel: user.aiModel,
    aiSettings: user.aiSettings,
  };
}

exports.parseTask = async (req, res, next) => {
  try {
    if (rejectInvalidChain(req, res)) return;
    const { input } = req.body;
    if (typeof input !== 'string' || !input.trim()) {
      return res.status(400).json({ message: 'Input text is required' });
    }
    if (tooLong(input)) {
      return res.status(400).json({ message: `Input text must be at most ${MAX_AI_INPUT} characters` });
    }
    const userSettings = await getUserAiSettings(req);
    const result = await aiService.parseTask(input, userSettings);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.breakdownTask = async (req, res, next) => {
  try {
    if (rejectInvalidChain(req, res)) return;
    const task = await Task.findOne({ _id: req.params.id, userId: req.user._id });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const userSettings = await getUserAiSettings(req);
    const result = await aiService.breakdownTask(task, userSettings);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.suggestPriorities = async (req, res, next) => {
  try {
    const tasks = await Task.find({ userId: req.user._id, status: { $nin: ['completed', 'cancelled'] } })
      .limit(20)
      .select('title description dueDate priority');
    const userSettings = await getUserAiSettings(req);
    const result = await aiService.suggestPriorities(tasks, userSettings);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.generateDigest = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [tasks, total, completed, pending, overdue] = await Promise.all([
      Task.find({ userId: req.user._id }).limit(50).select('title status priority dueDate'),
      Task.countDocuments({ userId: req.user._id }),
      Task.countDocuments({ userId: req.user._id, status: 'completed', completedAt: { $gte: today } }),
      Task.countDocuments({ userId: req.user._id, status: { $in: ['pending', 'in-progress'] } }),
      Task.countDocuments({
        userId: req.user._id,
        dueDate: { $lte: new Date() },
        status: { $nin: ['completed', 'cancelled'] },
      }),
    ]);

    const stats = { total, completed, pending, overdue };
    const userSettings = await getUserAiSettings(req);
    const result = await aiService.generateDigest(tasks, stats, userSettings);
    res.json({ ...result, stats });
  } catch (error) {
    next(error);
  }
};

exports.chat = async (req, res, next) => {
  try {
    if (rejectInvalidChain(req, res)) return;
    const { message } = req.body;
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
    }
    if (tooLong(message)) {
      return res.status(400).json({ message: `Message must be at most ${MAX_AI_INPUT} characters` });
    }

    const taskCount = await Task.countDocuments({ userId: req.user._id });
    const tasks = await Task.find({ userId: req.user._id })
      .limit(10)
      .sort({ createdAt: -1 })
      .select('title status priority dueDate');

    const taskSummary = tasks.map(t => `"${t.title}" [${t.status}] priority:${t.priority}`).join('; ');

    const userSettings = await getUserAiSettings(req);
    const result = await aiService.chat(message, { taskCount, taskSummary }, userSettings);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.generateTitle = async (req, res, next) => {
  try {
    if (rejectInvalidChain(req, res)) return;
    const { description } = req.body;
    if (typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ message: 'Description is required' });
    }
    if (tooLong(description)) {
      return res.status(400).json({ message: `Description must be at most ${MAX_AI_INPUT} characters` });
    }
    const userSettings = await getUserAiSettings(req);
    const result = await aiService.generateTitle(description, userSettings);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

exports.suggestNextAction = async (req, res, next) => {
  try {
    const tasks = await Task.find({
      userId: req.user._id,
      status: { $in: ['pending', 'in-progress'] },
    })
      .sort({ priority: 1, dueDate: 1 })
      .limit(10)
      .select('title priority dueDate status');

    const userSettings = await getUserAiSettings(req);
    const result = await aiService.suggestNextAction(tasks, userSettings);
    res.json(result);
  } catch (error) {
    next(error);
  }
};
