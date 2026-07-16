'use strict';

const logger = require('../utils/logger');
const { createProvider, getProviderMetadata } = require('./aiProviders');
const User = require('../models/User');

// ---------------------------------------------------------------------------
// AI Service — provider-agnostic layer
//
// All functions accept an optional `userSettings` object containing:
//   aiProvider, aiApiKey, aiModel, aiSettings={temperature, maxTokens, streaming, timeout}
//
// If userSettings is not provided or no provider is configured, functions
// return fallback/heuristic responses so the app continues to work.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPTS = {
  parse: `You are a task parsing assistant. Extract structured task data from natural language input.
Return JSON with: title (required), description, priority (critical/high/medium/low/none), 
dueDate (ISO date string or null), status (backlog/pending/in-progress), tags (array of strings), 
category (string), estimatedTime (minutes number).
If no date is mentioned, set dueDate to null. Default priority is medium. Default status is pending.
Example input: "Call John tomorrow at 5pm high priority"
Example output: { "title": "Call John", "description": "", "priority": "high", "dueDate": "2025-01-15T17:00:00.000Z", "status": "pending", "tags": [], "category": "general", "estimatedTime": 0 }`,

  breakdown: `You are a task breakdown assistant. Given a task title and description, break it down into 
manageable subtasks. Return a JSON object with a "subtasks" array of { "title": string } objects.
Generate 3-7 subtasks that cover the main work items.`,

  summarize: `You are a task summarization assistant. Given task data, generate a helpful summary.
Return JSON with: summary (2-3 sentences), suggestedPriority (critical/high/medium/low/none), 
suggestedTags (array of strings), suggestedCategory (string).`,

  chat: `You are a helpful AI task management assistant. Help users manage their tasks, answer questions 
about their tasks, suggest next actions, and provide productivity advice. Keep responses concise and actionable.`,

  prioritize: `You are a task prioritization assistant. Given a list of tasks with their titles, descriptions, 
due dates, and current priorities, suggest a priority level (critical/high/medium/low/none) for each task 
and return JSON with array of { taskId, suggestedPriority, reasoning }.`,

  digest: `You are a daily task digest generator. Given a user's tasks, generate a helpful daily summary 
in JSON format with: greeting, completedCount, pendingCount, overdueCount, topPriority (task title), 
quote (motivational string), suggestion (actionable advice string).`,

  nextAction: `You are a "what to work on next" assistant. Given a list of tasks with their priorities, 
due dates, and statuses, recommend the single best task to work on next. Return JSON with: 
taskId, title, reasoning (1 sentence).`,

  title: 'Generate a concise, clear task title (max 10 words) from the description. Return JSON with: { "title": string }.',
};

/**
 * Fetch user's AI settings from DB if only userId is provided.
 * @param {object|string} userSettingsOrId
 * @returns {Promise<object|null>}
 */
async function resolveSettings(userSettingsOrId) {
  if (!userSettingsOrId) return null;
  if (typeof userSettingsOrId === 'string') {
    const user = await User.findById(userSettingsOrId).select('+aiApiKey').lean();
    return user || null;
  }
  if (userSettingsOrId.aiProvider) {
    return userSettingsOrId;
  }
  if (userSettingsOrId._id) {
    const user = await User.findById(userSettingsOrId._id).select('+aiApiKey').lean();
    return user || null;
  }
  return userSettingsOrId || null;
}

/**
 * Get provider key name for logging/display.
 * @param {object|null} settings
 * @returns {string}
 */
function getProviderLabel(settings) {
  if (!settings || !settings.aiProvider) return 'none';
  const meta = getProviderMetadata(settings.aiProvider);
  return meta ? meta.label : settings.aiProvider;
}

/**
 * Build messages array from system prompt and user input.
 */
function buildMessages(system, user) {
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/**
 * Core LLM call using the provider abstraction.
 * Returns the response text or throws.
 */
async function queryLLM(messages, options = {}, userSettings) {
  const provider = createProvider(userSettings);
  if (!provider) {
    throw new Error('No AI provider configured');
  }
  return provider.chat(messages, options);
}

// ----- Fallback responses (when no AI provider is configured) -----

function fallbackResponse(messages) {
  const lastMessage = messages[messages.length - 1]?.content || '';
  const systemMessage = messages[0]?.content || '';

  if (systemMessage.includes('parse')) {
    return JSON.stringify({
      title: lastMessage.substring(0, 100),
      description: '',
      priority: 'medium',
      dueDate: null,
      status: 'pending',
      tags: [],
      category: 'general',
      estimatedTime: 0,
    });
  }

  if (systemMessage.includes('breakdown')) {
    return JSON.stringify({
      subtasks: [
        { title: `Research and plan ${lastMessage.substring(0, 30)}` },
        { title: 'Create initial implementation' },
        { title: 'Review and refine' },
        { title: 'Test and validate' },
      ],
    });
  }

  if (systemMessage.includes('digest')) {
    const now = new Date();
    const hours = now.getHours();
    const greeting = hours < 12 ? 'Good morning' : hours < 18 ? 'Good afternoon' : 'Good evening';
    return JSON.stringify({
      greeting: `${greeting}! Here's your task overview for today.`,
      completedCount: 0,
      pendingCount: 0,
      overdueCount: 0,
      topPriority: 'No tasks yet',
      quote: 'The secret of getting ahead is getting started. — Mark Twain',
      suggestion: 'Start with your most important task first thing in the morning.',
    });
  }

  return JSON.stringify({ message: 'AI processing unavailable. Configure an AI provider in Settings to enable AI features.' });
}

// ----- Public API -----

/**
 * Parse natural language into a task object.
 * @param {string} input
 * @param {object} [userSettings] - user AI config
 * @returns {Promise<object>}
 */
exports.parseTask = async (input, userSettings) => {
  const settings = await resolveSettings(userSettings);
  const messages = buildMessages(SYSTEM_PROMPTS.parse, input);
  try {
    const content = await queryLLM(messages, { responseFormat: true }, settings);
    try {
      return JSON.parse(content);
    } catch {
      return {
        title: input, description: '', priority: 'medium',
        dueDate: null, status: 'pending', tags: [], category: 'general', estimatedTime: 0,
      };
    }
  } catch (error) {
    logger.warn(`[AI:${getProviderLabel(settings)}] parseTask fallback: ${error.message}`);
    const content = fallbackResponse(messages);
    return JSON.parse(content);
  }
};

/**
 * Break down a task into subtasks.
 * @param {object} task
 * @param {object} [userSettings]
 * @returns {Promise<object>}
 */
exports.breakdownTask = async (task, userSettings) => {
  const settings = await resolveSettings(userSettings);
  const messages = buildMessages(
    SYSTEM_PROMPTS.breakdown,
    `Task: "${task.title}"\nDescription: "${task.description || ''}"`
  );
  try {
    const content = await queryLLM(messages, { responseFormat: true }, settings);
    try {
      return JSON.parse(content);
    } catch {
      return { subtasks: [{ title: `Break down "${task.title}" into smaller steps` }] };
    }
  } catch (error) {
    logger.warn(`[AI:${getProviderLabel(settings)}] breakdownTask fallback: ${error.message}`);
    const content = fallbackResponse(messages);
    return JSON.parse(content);
  }
};

/**
 * Suggest priorities for a list of tasks.
 * @param {Array} tasks
 * @param {object} [userSettings]
 * @returns {Promise<Array>}
 */
exports.suggestPriorities = async (tasks, userSettings) => {
  const settings = await resolveSettings(userSettings);
  const messages = buildMessages(
    SYSTEM_PROMPTS.prioritize,
    JSON.stringify(tasks.map((t) => ({
      id: t._id, title: t.title, description: t.description,
      dueDate: t.dueDate, priority: t.priority,
    })))
  );
  try {
    const content = await queryLLM(messages, { responseFormat: true, maxTokens: 1000 }, settings);
    try {
      return JSON.parse(content);
    } catch {
      return [];
    }
  } catch (error) {
    logger.warn(`[AI:${getProviderLabel(settings)}] suggestPriorities fallback: ${error.message}`);
    return [];
  }
};

/**
 * Generate a daily digest.
 * @param {Array} tasks
 * @param {object} stats
 * @param {object} [userSettings]
 * @returns {Promise<object>}
 */
exports.generateDigest = async (tasks, stats, userSettings) => {
  const settings = await resolveSettings(userSettings);
  const messages = buildMessages(
    SYSTEM_PROMPTS.digest,
    JSON.stringify({
      tasks: tasks.map((t) => ({ title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate })),
      stats,
    })
  );
  try {
    const content = await queryLLM(messages, { temperature: 0.7, maxTokens: 800, responseFormat: true }, settings);
    try {
      return JSON.parse(content);
    } catch {
      throw new Error('Invalid JSON from AI');
    }
  } catch (error) {
    logger.warn(`[AI:${getProviderLabel(settings)}] generateDigest fallback: ${error.message}`);
    return fallbackDigest(stats);
  }
};

function fallbackDigest(stats) {
  const now = new Date();
  const hours = now.getHours();
  const greeting = hours < 12 ? 'Good morning' : hours < 18 ? 'Good afternoon' : 'Good evening';
  return {
    greeting: `${greeting}!`,
    completedCount: stats?.completed || 0,
    pendingCount: stats?.pending || 0,
    overdueCount: stats?.overdue || 0,
    topPriority: 'No tasks',
    quote: 'Stay focused and keep moving forward.',
    suggestion: 'Review your task list and prioritize what matters most.',
  };
}

/**
 * Chat with the AI assistant.
 * @param {string} message
 * @param {object} context - { taskCount, taskSummary }
 * @param {object} [userSettings]
 * @returns {Promise<{text: string, provider: string, error?: boolean}>}
 */
exports.chat = async (message, context, userSettings) => {
  const settings = await resolveSettings(userSettings);
  const providerLabel = getProviderLabel(settings);

  if (!settings || !settings.aiProvider) {
    return {
      text: "I'm not connected to an AI provider yet. Go to Settings → AI to configure your preferred AI provider and enter your API key. Until then, you can continue managing tasks manually!",
      provider: 'none',
      error: true,
    };
  }

  const messages = buildMessages(
    SYSTEM_PROMPTS.chat,
    `Context: I have ${context.taskCount || 0} tasks. ${context.taskSummary || ''}\n\nUser: ${message}`
  );

  try {
    const text = await queryLLM(messages, { temperature: 0.7, maxTokens: 500 }, settings);
    return { text, provider: providerLabel };
  } catch (error) {
    logger.warn(`[AI:${providerLabel}] chat failed: ${error.message}`);
    return {
      text: `I'm having trouble connecting to ${providerLabel}. Please check your API key and network connection in Settings → AI, then try again.`,
      provider: providerLabel,
      error: true,
    };
  }
};

/**
 * Generate a title from a description.
 * @param {string} description
 * @param {object} [userSettings]
 * @returns {Promise<object>}
 */
exports.generateTitle = async (description, userSettings) => {
  const settings = await resolveSettings(userSettings);
  const messages = buildMessages(SYSTEM_PROMPTS.title, description);
  try {
    const content = await queryLLM(messages, { responseFormat: true, maxTokens: 100 }, settings);
    try {
      return JSON.parse(content);
    } catch {
      return { title: description.substring(0, 80) };
    }
  } catch (error) {
    logger.warn(`[AI:${getProviderLabel(settings)}] generateTitle fallback: ${error.message}`);
    return { title: description.substring(0, 80) };
  }
};

/**
 * Suggest the next action/task to work on.
 * @param {Array} tasks
 * @param {object} [userSettings]
 * @returns {Promise<object>}
 */
exports.suggestNextAction = async (tasks, userSettings) => {
  const settings = await resolveSettings(userSettings);
  const messages = buildMessages(
    SYSTEM_PROMPTS.nextAction,
    JSON.stringify(
      tasks.map((t) => ({
        id: t._id, title: t.title, priority: t.priority,
        dueDate: t.dueDate, status: t.status,
      }))
    )
  );
  try {
    const content = await queryLLM(messages, { responseFormat: true }, settings);
    try {
      return JSON.parse(content);
    } catch {
      return { taskId: tasks[0]?._id, title: tasks[0]?.title || '', reasoning: 'This is your highest priority task.' };
    }
  } catch (error) {
    logger.warn(`[AI:${getProviderLabel(settings)}] suggestNextAction fallback: ${error.message}`);
    return { taskId: tasks[0]?._id, title: tasks[0]?.title || '', reasoning: 'This is your highest priority task.' };
  }
};

/**
 * Get info about the current AI configuration.
 * @param {object} [userSettings]
 * @returns {object}
 */
exports.getProviderInfo = (userSettings) => {
  if (!userSettings || !userSettings.aiProvider) {
    return { key: null, label: 'Not configured', model: null };
  }
  const meta = getProviderMetadata(userSettings.aiProvider);
  return {
    key: userSettings.aiProvider,
    label: meta ? meta.label : userSettings.aiProvider,
    model: userSettings.aiModel || (meta ? meta.defaultModel : ''),
  };
};
