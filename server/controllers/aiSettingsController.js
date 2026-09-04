'use strict';

const User = require('../models/User');
const logger = require('../utils/logger');
const { createProvider, getProviderMetadata, getProviderDirectory } = require('../services/aiProviders');
const response = require('../utils/response');

// Built-in providers have a fixed baseURL set in PROVIDER_METADATA, so any
// user-supplied baseURL override must point to an allowlisted hostname.
// We accept the well-known first-party hosts plus a small list of self-hosted
// inference services. Anything else is rejected.
const ALLOWED_BASEURL_HOSTS = new Set([
  'api.openai.com',
  'generativelanguage.googleapis.com',
  'api.anthropic.com',
  'api.groq.com',
  'openrouter.ai',
  'api.together.xyz',
  // Self-hosted / on-prem (user must be running their own network).
  'localhost',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
]);

// Block cloud metadata endpoints and other known internal addresses.
const BLOCKED_HOSTNAMES = new Set([
  '169.254.169.254',   // AWS / Azure IMDS
  'metadata.google.internal', // GCP
  'metadata.google.internal.',
]);

function isAllowedBaseUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const isLoopback = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(u.hostname);
    // Disallow plain http unless it's a loopback host (self-hosted).
    if (u.protocol === 'http:' && !isLoopback) {
      return false;
    }
    if (BLOCKED_HOSTNAMES.has(u.hostname)) return false;
    if (!ALLOWED_BASEURL_HOSTS.has(u.hostname)) return false;
    // Loopback http is used for self-hosted inference (Ollama, LM Studio, ...)
    // which commonly runs on 11434/1234/8080. Reject exotic ports so the AI
    // test endpoint can't reach arbitrary local services (SSRF).
    if (u.protocol === 'http:' && isLoopback && u.port && !['80', '11434', '1234', '8080', '3000', '8000'].includes(u.port)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Mask an API key for safe display.
 */
function maskApiKey(key) {
  if (!key || key.length < 8) return '••••••••';
  // Always show at most 2 chars on each end so short keys are never fully revealed.
  const show = Math.min(2, Math.floor(key.length / 4));
  return key.substring(0, show) + '••••••••' + key.substring(key.length - show);
}

/**
 * GET /api/auth/ai-settings
 * Return the user's AI provider settings (with masked API key).
 */
exports.getAiSettings = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+aiApiKey').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      aiProvider: user.aiProvider || null,
      aiApiKey: maskApiKey(user.aiApiKey || ''),
      hasApiKey: !!(user.aiApiKey),
      aiModel: user.aiModel || '',
      aiBaseUrl: user.aiBaseUrl || '',
      aiSettings: user.aiSettings || {
        temperature: 0.3,
        maxTokens: 500,
        streaming: false,
        timeout: 30000,
      },
      supportedProviders: getProviderDirectory(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/auth/ai-settings
 * Update the user's AI provider settings.
 * Never logs the API key. Returns masked key in response.
 */
exports.updateAiSettings = async (req, res, next) => {
  try {
    const { aiProvider, aiApiKey, aiModel, aiBaseUrl, aiSettings } = req.body;

    // Build update object — only set fields that are provided
    const update = {};

    if (aiProvider !== undefined) {
      if (aiProvider !== null && !getProviderMetadata(aiProvider)) {
        return res.status(400).json({ message: `Unsupported AI provider: ${aiProvider}` });
      }
      update.aiProvider = aiProvider;
    }

    if (aiApiKey !== undefined) {
      if (aiApiKey !== '' && aiApiKey.length < 8) {
        return res.status(400).json({ message: 'API key must be at least 8 characters' });
      }
      update.aiApiKey = aiApiKey;
    }

    if (aiModel !== undefined) {
      if (aiModel !== '' && aiModel.length > 200) {
        return res.status(400).json({ message: 'Model name too long' });
      }
      update.aiModel = aiModel;
    }

    if (aiBaseUrl !== undefined) {
      if (aiBaseUrl !== '' && !isAllowedBaseUrl(aiBaseUrl)) {
        return res.status(400).json({
          message: 'Base URL must use https:// (or http://localhost) and point to a known provider host.',
        });
      }
      update.aiBaseUrl = aiBaseUrl;
    }

    if (aiSettings !== undefined) {
      const sanitized = {};
      if (aiSettings.temperature !== undefined) {
        const t = Number(aiSettings.temperature);
        if (isNaN(t) || t < 0 || t > 2) {
          return res.status(400).json({ message: 'Temperature must be between 0 and 2' });
        }
        sanitized.temperature = t;
      }
      if (aiSettings.maxTokens !== undefined) {
        const m = Number(aiSettings.maxTokens);
        if (isNaN(m) || m < 1 || m > 100000) {
          return res.status(400).json({ message: 'Max tokens must be between 1 and 100000' });
        }
        sanitized.maxTokens = m;
      }
      if (aiSettings.streaming !== undefined) {
        sanitized.streaming = aiSettings.streaming === true || aiSettings.streaming === 'true';
      }
      if (aiSettings.timeout !== undefined) {
        const t = Number(aiSettings.timeout);
        if (isNaN(t) || t < 1000 || t > 300000) {
          return res.status(400).json({ message: 'Timeout must be between 1000 and 300000 ms' });
        }
        sanitized.timeout = t;
      }

      // Merge with existing settings
      const user = await User.findById(req.user._id).select('+aiSettings').lean();
      update.aiSettings = { ...(user?.aiSettings || {}), ...sanitized };
    }

    await User.findByIdAndUpdate(req.user._id, { $set: update }, { runValidators: true });

    // Fetch updated user to return masked state
    const updated = await User.findById(req.user._id).select('+aiApiKey').lean();

    res.json({
      message: 'AI settings updated successfully',
      aiProvider: updated.aiProvider || null,
      aiApiKey: maskApiKey(updated.aiApiKey || ''),
      hasApiKey: !!(updated.aiApiKey),
      aiModel: updated.aiModel || '',
      aiBaseUrl: updated.aiBaseUrl || '',
      aiSettings: updated.aiSettings || {
        temperature: 0.3,
        maxTokens: 500,
        streaming: false,
        timeout: 30000,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/test-ai
 * Test the AI connection with the provided or saved settings.
 * Never exposes the API key in logs or response.
 */
exports.testAiConnection = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('+aiApiKey').lean();
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const incomingBaseUrl = req.body.aiBaseUrl ?? user.aiBaseUrl ?? '';
    // Re-validate the base URL using the same allowlist the save path uses —
    // the test endpoint should not be a back door for SSRF.
    if (incomingBaseUrl && !isAllowedBaseUrl(incomingBaseUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Base URL must use https:// (or http://localhost) and point to a known provider host.',
      });
    }

    // Use provided settings or fall back to saved
    const testSettings = {
      aiProvider: req.body.aiProvider || user.aiProvider,
      aiApiKey: req.body.aiApiKey || user.aiApiKey || '',
      aiModel: req.body.aiModel || user.aiModel,
      aiBaseUrl: incomingBaseUrl,
      aiSettings: {
        temperature: req.body.temperature ?? user.aiSettings?.temperature ?? 0.3,
        maxTokens: req.body.maxTokens ?? user.aiSettings?.maxTokens ?? 50,
        timeout: req.body.timeout ?? user.aiSettings?.timeout ?? 10000,
      },
    };

    if (!testSettings.aiProvider) {
      return res.status(400).json({ success: false, message: 'No AI provider selected' });
    }

    if (!testSettings.aiApiKey) {
      return res.status(400).json({ success: false, message: 'No API key provided' });
    }

    const provider = createProvider(testSettings);
    if (!provider) {
      return res.status(400).json({ success: false, message: `Unsupported provider: ${testSettings.aiProvider}` });
    }

    const result = await provider.testConnection();
    res.json(result);
  } catch (error) {
    logger.error('AI connection test error:', error.message);
    res.json({ success: false, message: error.message || 'Connection test failed' });
  }
};

/**
 * DELETE /api/auth/ai-settings
 * Remove AI provider configuration.
 */
exports.removeAiSettings = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        aiProvider: null,
        aiApiKey: '',
        aiModel: '',
        aiBaseUrl: '',
        aiSettings: { temperature: 0.3, maxTokens: 500, streaming: false, timeout: 30000 },
      },
    });

    res.json({ message: 'AI provider configuration removed successfully' });
  } catch (error) {
    next(error);
  }
};
