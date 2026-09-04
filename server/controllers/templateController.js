const TaskTemplate = require('../models/TaskTemplate');
const { validationResult } = require('express-validator');

const validate = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error(errors.array().map((e) => e.msg).join(', '));
    error.statusCode = 400;
    throw error;
  }
};

// -------------------- Get All Templates --------------------
exports.getTemplates = async (req, res, next) => {
  try {
    const { category, tag } = req.query;
    const query = { userId: req.user._id };

    if (category && typeof category === 'string') query.category = category;
    if (tag && typeof tag === 'string') query.tags = tag;

    const templates = await TaskTemplate.find(query)
      .sort({ usageCount: -1, createdAt: -1 })
      .select('-__v');

    res.json({ templates });
  } catch (error) {
    next(error);
  }
};

// -------------------- Get Template by ID --------------------
exports.getTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await TaskTemplate.findById(id).select('-__v');

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const isOwner = template.userId.toString() === req.user._id.toString();
    const isShared = template.isShared;

    if (!isOwner && !isShared) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ template });
  } catch (error) {
    next(error);
  }
};

// -------------------- Create Template --------------------
exports.createTemplate = async (req, res, next) => {
  try {
    const { title, description, category, priority, status, estimatedTime, subtasks, tags, isShared, sharedWith } = req.body;

    // Reasonable limit to prevent DoS via oversized subtask arrays.
    if (subtasks && Array.isArray(subtasks) && subtasks.length > 100) {
      return res.status(400).json({ message: 'Templates cannot have more than 100 subtasks' });
    }

    const template = await TaskTemplate.create({
      title,
      description,
      category,
      priority,
      status,
      estimatedTime,
      subtasks: subtasks || [],
      tags: tags || [],
      userId: req.user._id,
      isShared: isShared || false,
      sharedWith: isShared ? sharedWith || [] : [],
    });

    res.status(201).json({ template });
  } catch (error) {
    next(error);
  }
};

// -------------------- Update Template --------------------
exports.updateTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await TaskTemplate.findById(id);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    if (template.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { title, description, category, priority, status, estimatedTime, subtasks, tags, isShared: newShared, sharedWith } = req.body;

    if (title !== undefined) template.title = title;
    if (description !== undefined) template.description = description;
    if (category !== undefined) template.category = category;
    if (priority !== undefined) template.priority = priority;
    if (status !== undefined) template.status = status;
    if (estimatedTime !== undefined) template.estimatedTime = estimatedTime;
    if (subtasks !== undefined) {
      if (Array.isArray(subtasks) && subtasks.length > 100) {
        return res.status(400).json({ message: 'Templates cannot have more than 100 subtasks' });
      }
      template.subtasks = subtasks;
    }
    if (tags !== undefined) template.tags = tags;
    if (newShared !== undefined) template.isShared = newShared;
    if (newShared && sharedWith !== undefined) template.sharedWith = sharedWith;

    await template.save();

    res.json({ template });
  } catch (error) {
    next(error);
  }
};

// -------------------- Delete Template --------------------
exports.deleteTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await TaskTemplate.findById(id);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    if (template.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await template.deleteOne();

    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// -------------------- Apply Template to Task --------------------
exports.applyTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await TaskTemplate.findById(id);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const isOwner = template.userId.toString() === req.user._id.toString();
    const isShared = template.isShared;

    if (!isOwner && !isShared) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Increment usage count
    template.usageCount = (template.usageCount || 0) + 1;
    await template.save();

    // Return template data for quick task creation
    res.json({ template });
  } catch (error) {
    next(error);
  }
};

// -------------------- Copy Template --------------------
exports.copyTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const template = await TaskTemplate.findById(id);

    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const isOwner = template.userId.toString() === req.user._id.toString();
    const isShared = template.isShared;

    if (!isOwner && !isShared) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const newTemplate = await TaskTemplate.create({
      title: `${template.title} (Copy)`,
      description: template.description,
      category: template.category,
      priority: template.priority,
      status: template.status,
      estimatedTime: template.estimatedTime,
      subtasks: template.subtasks,
      tags: template.tags,
      userId: req.user._id,
      isShared: false,
      sharedWith: [],
    });

    res.status(201).json({ template: newTemplate });
  } catch (error) {
    next(error);
  }
};

// -------------------- Get Shared Templates --------------------
exports.getSharedTemplates = async (req, res, next) => {
  try {
    const templates = await TaskTemplate.find({
      isShared: true,
      userId: { $ne: req.user._id },
    }).select('-__v');

    res.json({ templates });
  } catch (error) {
    next(error);
  }
};
