'use strict';

const BaseProvider = require('./BaseProvider');

/**
 * Provider for Anthropic Claude API.
 * Uses the @anthropic-ai/sdk SDK.
 */
class AnthropicProvider extends BaseProvider {
  /**
   * @param {object} config
   * @param {string} config.apiKey
   * @param {string} config.model
   * @param {number} [config.temperature=0.3]
   * @param {number} [config.maxTokens=500]
   * @param {number} [config.timeout=30000]
   */
  constructor(config = {}) {
    super(config);
    this._client = null;
  }

  _getClient() {
    if (this._client) return this._client;
    let Anthropic;
    try {
      ({ Anthropic } = require('@anthropic-ai/sdk'));
    } catch {
      throw new Error(
        'Anthropic provider requires the "@anthropic-ai/sdk" package. Run: npm i @anthropic-ai/sdk'
      );
    }
    this._client = new Anthropic({
      apiKey: this.apiKey,
      timeout: this.timeout,
    });
    return this._client;
  }

  async chat(messages, options = {}) {
    const systemMessage = messages.find((m) => m.role === 'system')?.content || '';
    const userMessage = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n');

    const client = this._getClient();
    const msg = await client.messages.create({
      model: this.model,
      system: systemMessage,
      max_tokens: options.maxTokens ?? this.maxTokens,
      temperature: options.temperature ?? this.temperature,
      messages: [{ role: 'user', content: userMessage }],
    });

    return msg.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
  }
}

module.exports = AnthropicProvider;
