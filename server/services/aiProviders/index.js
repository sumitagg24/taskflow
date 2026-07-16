'use strict';

const OpenAICompatibleProvider = require('./OpenAICompatibleProvider');
const GeminiProvider = require('./GeminiProvider');
const AnthropicProvider = require('./AnthropicProvider');

/**
 * Provider metadata with base URLs, recommended models, and directory information.
 */
const PROVIDER_METADATA = {
  openai: {
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    class: OpenAICompatibleProvider,
    description: 'Industry-leading models for general-purpose AI tasks including chat, analysis, and code generation.',
    freeTier: false,
    pricing: 'Paid',
    recommendedFor: 'General purpose, coding, analysis, content creation',
    websiteUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs',
  },
  gemini: {
    label: 'Google Gemini',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-1.5-flash',
    class: GeminiProvider,
    description: 'Google\'s most capable AI models with strong multimodal understanding and long context windows.',
    freeTier: true,
    pricing: 'Free + Paid',
    recommendedFor: 'Long context, multimodal, research, cost-effective scaling',
    websiteUrl: 'https://aistudio.google.com/',
    docsUrl: 'https://ai.google.dev/docs',
  },
  anthropic: {
    label: 'Anthropic Claude',
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-5-sonnet-latest',
    class: AnthropicProvider,
    description: 'Safety-focused AI models excelling at nuanced reasoning, analysis, and thoughtful responses.',
    freeTier: false,
    pricing: 'Paid',
    recommendedFor: 'Reasoning, analysis, safety-critical applications, long-form content',
    websiteUrl: 'https://console.anthropic.com/',
    docsUrl: 'https://docs.anthropic.com/',
  },
  groq: {
    label: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    class: OpenAICompatibleProvider,
    description: 'Lightning-fast inference engine for open-source models with exceptional response speeds.',
    freeTier: true,
    pricing: 'Free + Paid',
    recommendedFor: 'Low-latency applications, rapid prototyping, real-time chat',
    websiteUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs',
  },
  openrouter: {
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    class: OpenAICompatibleProvider,
    description: 'Unified API gateway providing access to 200+ models from multiple providers with a single key.',
    freeTier: true,
    pricing: 'Free + Paid',
    recommendedFor: 'Multi-model comparison, fallback routing, accessing many providers',
    websiteUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
  },
  together: {
    label: 'Together AI',
    baseURL: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    class: OpenAICompatibleProvider,
    description: 'Cloud platform for running and fine-tuning open-source models at scale.',
    freeTier: true,
    pricing: 'Free + Paid',
    recommendedFor: 'Open-source models, fine-tuning, cost-effective inference',
    websiteUrl: 'https://api.together.ai/',
    docsUrl: 'https://docs.together.ai/',
  },
  'openai-compatible': {
    label: 'OpenAI Compatible',
    baseURL: '',
    defaultModel: '',
    class: OpenAICompatibleProvider,
    description: 'Connect any OpenAI-compatible API endpoint including self-hosted models and custom services.',
    freeTier: null,
    pricing: 'Varies',
    recommendedFor: 'Custom endpoints, self-hosted models, private deployments',
    websiteUrl: null,
    docsUrl: null,
  },
};

/**
 * List of supported provider keys.
 * @returns {string[]}
 */
function getSupportedProviders() {
  return Object.keys(PROVIDER_METADATA);
}

/**
 * Get metadata for a specific provider.
 * @param {string} key
 * @returns {object|null}
 */
function getProviderMetadata(key) {
  return PROVIDER_METADATA[key] || null;
}

/**
 * Get recommended models for a provider.
 * @param {string} providerKey
 * @returns {string[]}
 */
function getRecommendedModels(providerKey) {
  const models = {
    openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    gemini: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
    anthropic: ['claude-3-5-sonnet-latest', 'claude-3-opus-latest', 'claude-3-haiku-latest'],
    groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it', 'deepseek-r1-distill-llama-70b'],
    openrouter: ['openai/gpt-4o-mini', 'meta-llama/llama-3.3-70b-instruct', 'anthropic/claude-3.5-sonnet'],
    together: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mixtral-8x22B-Instruct-v0.1'],
    'openai-compatible': [''],
  };
  return models[providerKey] || [''];
}

/**
 * Get all provider directory info (for UI rendering).
 * @returns {Array}
 */
function getProviderDirectory() {
  return Object.entries(PROVIDER_METADATA).map(([key, meta]) => ({
    key,
    label: meta.label,
    defaultModel: meta.defaultModel || '',
    recommendedModels: getRecommendedModels(key),
    description: meta.description || '',
    freeTier: meta.freeTier,
    pricing: meta.pricing || '',
    recommendedFor: meta.recommendedFor || '',
    websiteUrl: meta.websiteUrl || null,
    docsUrl: meta.docsUrl || null,
  }));
}

/**
 * Create a provider instance from user AI settings.
 *
 * @param {object} userSettings
 * @param {string} userSettings.aiProvider - provider key
 * @param {string} userSettings.aiApiKey - API key
 * @param {string} userSettings.aiModel - model name
 * @param {object} [userSettings.aiSettings] - advanced settings
 * @param {number} [userSettings.aiSettings.temperature]
 * @param {number} [userSettings.aiSettings.maxTokens]
 * @param {number} [userSettings.aiSettings.timeout]
 * @returns {BaseProvider|null}
 */
function createProvider(userSettings) {
  if (!userSettings || !userSettings.aiProvider || !userSettings.aiApiKey) {
    return null;
  }

  const key = userSettings.aiProvider;
  const meta = PROVIDER_METADATA[key];
  if (!meta) return null;

  const advanced = userSettings.aiSettings || {};

  // Allow per-user baseURL override (especially for openai-compatible)
  const baseURL = userSettings.aiBaseUrl || meta.baseURL;

  const config = {
    apiKey: userSettings.aiApiKey,
    model: userSettings.aiModel || meta.defaultModel,
    temperature: advanced.temperature ?? 0.3,
    maxTokens: advanced.maxTokens ?? 500,
    timeout: advanced.timeout ?? 30000,
    baseURL,
  };

  return new meta.class(config);
}

module.exports = {
  createProvider,
  getSupportedProviders,
  getProviderMetadata,
  getRecommendedModels,
  getProviderDirectory,
  PROVIDER_METADATA,
};
