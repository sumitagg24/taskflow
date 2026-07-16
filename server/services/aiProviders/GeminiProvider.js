'use strict';

const BaseProvider = require('./BaseProvider');

/**
 * Provider for Google Gemini API.
 * Uses the @google/generative-ai SDK.
 */
class GeminiProvider extends BaseProvider {
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
    let genAI;
    try {
      const mod = require('@google/generative-ai');
      genAI = new mod.GoogleGenerativeAI(this.apiKey);
    } catch {
      throw new Error(
        'Gemini provider requires the "@google/generative-ai" package. Run: npm i @google/generative-ai'
      );
    }
    this._client = genAI;
    return this._client;
  }

  _getModel(systemInstruction) {
    const genAI = this._getClient();
    return genAI.getGenerativeModel({
      model: this.model,
      systemInstruction,
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: this.maxTokens,
      },
    });
  }

  async chat(messages, options = {}) {
    const systemMessage = messages.find((m) => m.role === 'system')?.content || '';
    const userMessages = messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n');

    const model = this._getModel(systemMessage);
    const result = await model.generateContent(userMessages);
    return result.response.text();
  }
}

module.exports = GeminiProvider;
