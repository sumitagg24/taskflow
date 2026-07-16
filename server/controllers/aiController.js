const Task = require('../models/Task');
const aiService = require('../services/aiService');

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
    const { input } = req.body;
    if (!input || !input.trim()) {
      return res.status(400).json({ message: 'Input text is required' });
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
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required' });
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
    const { description } = req.body;
    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Description is required' });
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
