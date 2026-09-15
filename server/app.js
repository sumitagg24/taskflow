/**
 * Express application factory — request handling WITHOUT process concerns.
 *
 * server.js (persistent: HTTP + Socket.IO + intervals) and api/index.js
 * (Vercel serverless: stateless handler, no listen, no realtime) both build
 * their request pipeline from createApp(). Anything that must NOT run per
 * serverless invocation — server.listen(), setInterval jobs, startup
 * migrations, Socket.IO attach, static /uploads in s3 mode — lives OUTSIDE
 * this module.
 *
 * Security controls are preserved verbatim from server.js: helmet CSP
 * (Auth0-aware), CORS allowlist, CSRF origin check, rate limiters,
 * validation chains on the route modules, and the error handler last.
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const taskRoutes = require('./routes/taskRoutes');
const authRoutes = require('./routes/authRoutes');
const aiRoutes = require('./routes/aiRoutes');
const systemRoutes = require('./routes/systemRoutes');
const templateRoutes = require('./routes/templateRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const timeTrackingRoutes = require('./routes/timeTrackingRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const growthRoutes = require('./routes/growthRoutes');
const cronRoutes = require('./routes/cronRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const errorHandler = require('./middleware/errorHandler');
const requestId = require('./middleware/requestId');
const csrfProtection = require('./middleware/csrf');
const { apiLimiter, aiLimiter, uploadLimiter } = require('./middleware/rateLimiter');
const { protect } = require('./middleware/auth');
const { isOriginAllowed } = require('./config/cors');
const storage = require('./config/storage');
const logger = require('./utils/logger');

function createApp(options = {}) {
  const { enableSpaFallback = true } = options;
  const app = express();

  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  // 1. Security headers — allow Auth0 tenant dynamically when configured
  const auth0CSP = process.env.AUTH0_DOMAIN
    ? `https://${String(process.env.AUTH0_DOMAIN).replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
    : null;
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com', "'sha256-GV3MzgrEm/WOEDkhHKYcrl36TKzqNh3EhZo4thC6H7k='", ...(auth0CSP ? [auth0CSP] : [])],
        // Auth0's SDK mints its token-refresh Web Worker from a blob: URL —
        // without an explicit worker-src the worker falls back to script-src
        // and is blocked, breaking the SDK's background renewal.
        workerSrc: ["'self'", 'blob:'],
        frameSrc: ["'self'", 'https://accounts.google.com', ...(auth0CSP ? [auth0CSP] : [])],
        connectSrc: ["'self'", 'https://accounts.google.com', ...(auth0CSP ? [auth0CSP] : [])],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://accounts.google.com', ...(auth0CSP ? [auth0CSP] : [])],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        formAction: ["'self'", 'https://github.com', ...(auth0CSP ? [auth0CSP] : [])],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    frameguard: { action: 'deny' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }));

  // 2. Request ID tracking
  app.use(requestId);

  // 3. Response compression
  app.use(compression());

  // 4. Request logging (quiet in test)
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  // 5. CORS - restrict in production via ALLOWED_ORIGINS (config/cors.js)
  app.use(cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  }));

  // 6. Body parsing with size limits
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 7. CSRF origin check for cookie-authed mutations
  app.use(csrfProtection);

  // Static files for uploads — local mode ONLY. In s3 mode there is nothing
  // on disk to serve (files live behind durable HTTPS URLs) and serverless
  // filesystems are ephemeral, so the mount is skipped entirely.
  if (!storage.isS3Mode()) {
    const uploadDir = storage.localUploadDir();
    try {
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    } catch (err) {
      logger.warn(`Upload dir not writable (${uploadDir}): ${err.message}`);
    }
    app.use('/uploads', express.static(uploadDir, {
      dotfiles: 'deny',
      index: false,
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'attachment');
        res.setHeader('Content-Security-Policy', 'sandbox');
      },
    }));
  }

  // Built client (SPA) — persistent single-service deploys serve the bundle
  // themselves. Serverless MUST disable this (Vercel serves the SPA; an API
  // function answering HTML for unknown routes recreates the silent-outage
  // class scripts/spa-config-check.cjs guards against).
  const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
  const clientIndex = path.join(clientDistPath, 'index.html');
  if (enableSpaFallback && fs.existsSync(clientIndex)) {
    app.use(express.static(clientDistPath));
  }

  // Health check (rate limited). Liveness only — use /api/ready for deps.
  app.get('/api/health', apiLimiter, (req, res) => {
    const readyState = require('mongoose').connection.readyState;
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      requestId: req.requestId,
      db: readyState === 1 ? 'connected' : readyState === 2 ? 'connecting' : 'disconnected',
    });
  });

  // Readiness probe — deep dependency check, 503 when ANY check fails.
  app.get('/api/ready', apiLimiter, async (req, res) => {
    try {
      const { checkReadiness } = require('./config/readiness');
      const { ready, checks } = await checkReadiness();
      res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not-ready',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        checks,
      });
    } catch (err) {
      logger.error('Readiness check error:', err.message);
      res.status(503).json({
        status: 'not-ready',
        timestamp: new Date().toISOString(),
        requestId: req.requestId,
        error: 'readiness check failed',
      });
    }
  });

  // Development diagnostics (dev-only inside the router)
  app.use('/api/system', systemRoutes);

  // Rate limited routes — unchanged paths, all /api/* preserved
  app.use('/api/auth', authRoutes);
  app.use('/api/tasks', apiLimiter, taskRoutes);
  app.use('/api/notifications', apiLimiter, notificationRoutes);
  app.use('/api/templates', apiLimiter, templateRoutes);
  app.use('/api/calendar', apiLimiter, calendarRoutes);
  app.use('/api/time-tracking', apiLimiter, timeTrackingRoutes);
  app.use('/api/growth', apiLimiter, growthRoutes);
  const dailyRoutes = require('./routes/dailyRoutes');
  app.use('/api/daily', apiLimiter, dailyRoutes);
  app.use('/api/ai', aiLimiter, aiRoutes);
  const aiSettingsRoutes = require('./routes/aiSettingsRoutes');
  app.use('/api/auth/ai-settings', apiLimiter, aiSettingsRoutes);

  // Authenticated callable jobs (CRON_SECRET bearer) — the serverless-safe
  // replacement for setInterval ticks.
  app.use('/api/cron', apiLimiter, cronRoutes);

  // Public contact-support intake (rate limited, validated; no auth so
  // logged-out visitors can reach support).
  const contactRoutes = require('./routes/contactRoutes');
  app.use('/api/contact', apiLimiter, contactRoutes);

  // File upload (protected + rate limited). Storage backend selected by
  // STORAGE_MODE inside the route module.
  app.use('/api/upload', protect, uploadLimiter, uploadRoutes);

  // API documentation (rate limited)
  const swaggerUi = require('swagger-ui-express');
  const swaggerSpec = require('./config/swagger');
  app.use('/api/docs', apiLimiter, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'TaskFlow API Docs',
  }));
  app.get('/api/docs.json', apiLimiter, (req, res) => res.json(swaggerSpec));

  // SPA fallback: serve index.html for non-API routes when enabled and the
  // bundle exists; otherwise JSON 404 (serverless / missing build).
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ message: 'API endpoint not found' });
    }
    if (enableSpaFallback && fs.existsSync(clientIndex)) {
      return res.sendFile(clientIndex);
    }
    return res.status(404).json({ message: 'Not found' });
  });

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
