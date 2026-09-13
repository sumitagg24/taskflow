'use strict';

const OpenAI = require('openai');
const BaseProvider = require('./BaseProvider');
const { ssrfFetch } = require('../../utils/ssrfFetch');

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
   * @param {string} [config.baseURL]
   * @param {string} config.model
   * @param {number} [config.temperature=0.3]
   * @param {number} [config.maxTokens=500]
   * @param {number} [config.timeout=30000]
   */
  constructor(config = {}) {
    super(config);
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    // Custom endpoints are user-supplied and SSRF-sensitive. The save-time
    // guard (aiSettingsController → ssrfGuard) checks the URL at rest, but the
    // SDK follows redirects on its own at runtime — a public endpoint could
    // 302 the request into the private network. Custom fetch re-validates
    // every hop (initial URL + each redirect target) and caps the response
    // size. Built-in provider base URLs (openai/groq/openrouter/together) are
    // operator-controlled and keep the SDK default path.
    const isCustom = config.baseURL !== undefined && config.baseURL !== null && config.baseURL !== '';
    this._client = new OpenAI({
      baseURL: this.baseURL,
      apiKey: this.apiKey,
      timeout: this.timeout,
      maxRetries: 2,
      ...(isCustom ? { fetch: ssrfFetch } : {}),
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
