'use strict';

const { sanitizeErrorMessage } = require('../../middleware/errorHandler');

/**
 * Base class for all AI providers.
 * Subclasses must implement the chat() method.
 */
class BaseProvider {
  /**
   * @param {object} config
   * @param {string} config.apiKey
   * @param {string} config.model
   * @param {number} [config.temperature=0.3]
   * @param {number} [config.maxTokens=500]
   * @param {number} [config.timeout=30000]
   */
  constructor(config = {}) {
    if (new.target === BaseProvider) {
      throw new Error('BaseProvider cannot be instantiated directly');
    }
    this.apiKey = config.apiKey || '';
    this.model = config.model || '';
    this.temperature = config.temperature ?? 0.3;
    this.maxTokens = config.maxTokens ?? 500;
    this.timeout = config.timeout ?? 30000;
  }

  /**
   * Send a chat completion request and return the response text.
   * @param {Array<{role: string, content: string}>} messages
   * @param {object} [options]
   * @param {number} [options.temperature]
   * @param {number} [options.maxTokens]
   * @param {boolean} [options.responseFormat] - if truthy, requests JSON mode
   * @returns {Promise<string>}
   */
  async chat(messages, options = {}) {
    throw new Error('chat() must be implemented by subclass');
  }

  /**
   * Test the connection by sending a simple prompt.
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testConnection() {
    try {
      const result = await this.chat(
        [
          { role: 'system', content: 'You are a helpful assistant. Respond with exactly: "Connection successful!"' },
          { role: 'user', content: 'Say hello' },
        ],
        { maxTokens: 50, temperature: 0 }
      );
      return { success: true, message: result || 'Connection successful!' };
    } catch (error) {
      return { success: false, message: sanitizeErrorMessage(error.message) || 'Connection failed' };
    }
  }
}

module.exports = BaseProvider;
