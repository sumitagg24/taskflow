'use strict';

const OpenAI = require('openai');
const BaseProvider = require('./BaseProvider');

/**
 * Provider for any OpenAI-compatible API:
 * - OpenAI (https://api.openai.com/v1)
 * - Groq (https://api.groq.com/openai/v1)
 * - Together AI (https://api.together.xyz/v1)
 * - OpenRouter (https://openrouter.ai/api/v1)
 * - Custom endpoints
 */
class OpenAICompatibleProvider extends BaseProvider {
  /**
   * @param {object} config
   * @param {string} config.apiKey
   * @param {string} config.baseURL
   * @param {string} config.model
   * @param {number} [config.temperature=0.3]
   * @param {number} [config.maxTokens=500]
   * @param {number} [config.timeout=30000]
   */
  constructor(config = {}) {
    super(config);
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this._client = new OpenAI({
      baseURL: this.baseURL,
      apiKey: this.apiKey,
      timeout: this.timeout,
      maxRetries: 2,
    });
  }

  async chat(messages, options = {}) {
    const response = await this._client.chat.completions.create({
      model: this.model,
      messages,
      temperature: options.temperature ?? this.temperature,
      max_tokens: options.maxTokens ?? this.maxTokens,
      ...(options.responseFormat ? { response_format: { type: 'json_object' } } : {}),
    });
    return response.choices[0].message.content;
  }
}

module.exports = OpenAICompatibleProvider;
