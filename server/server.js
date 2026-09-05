require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const connectDB = require('./config/db');
const taskRoutes = require('./routes/taskRoutes');
const authRoutes = require('./routes/authRoutes');
const aiRoutes = require('./routes/aiRoutes');
const systemRoutes = require('./routes/systemRoutes');
const templateRoutes = require('./routes/templateRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const timeTrackingRoutes = require('./routes/timeTrackingRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const growthRoutes = require('./routes/growthRoutes');
const errorHandler = require('./middleware/errorHandler');
const requestId = require('./middleware/requestId');
const { apiLimiter, aiLimiter, uploadLimiter } = require('./middleware/rateLimiter');
const { setupGracefulShutdown } = require('./utils/shutdown');
const { initializeSocket } = require('./services/socketService');
const upload = require('./config/upload');
const User = require('./models/User');
const logger = require('./utils/logger');

async function migrateUsernames() {
  const usersWithoutUsername = await User.find({ username: { $exists: false } }).lean();
  if (usersWithoutUsername.length === 0) return;

  logger.info(`Migrating ${usersWithoutUsername.length} users without username...`);
  for (const user of usersWithoutUsername) {
    let base = (user.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    if (!base || base.length < 3) {
      base = `user_${user._id.toString().slice(-6)}`;
    }

    let uniqueUsername = base.slice(0, 27);
    let counter = 1;
    while (await User.findOne({ username: uniqueUsername })) {
      const suffix = `_${counter}`;
      uniqueUsername = base.slice(0, 30 - suffix.length) + suffix;
      counter++;
    }

    await User.findByIdAndUpdate(user._id, { username: uniqueUsername });
  }
  logger.info('Username migration complete.');
}

// Validate critical environment variables on startup
const REQUIRED_ENV_VARS = ['MONGO_URI'];
for (const varName of REQUIRED_ENV_VARS) {
  if (!process.env[varName]) {
    throw new Error(`${varName} environment variable is required but not set`);
  }
}

if (process.env.NODE_ENV === 'production') {
  const PROD_REQUIRED = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
  for (const varName of PROD_REQUIRED) {
    if (!process.env[varName]) {
      throw new Error(`${varName} environment variable is required in production`);
    }
  }
  if (!process.env.CLIENT_URL) {
    throw new Error('CLIENT_URL environment variable is required in production');
  }
}

const app = express();
const server = http.createServer(app);

// Validate PORT — default to 5000, but enforce a valid port range if overridden.
const PORT = process.env.PORT || 5000;
const parsedPort = Number(PORT);
if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
  throw new Error(
    `Invalid PORT environment variable: "${PORT}". Must be an integer between 1 and 65535.`
  );
}

// Trust proxy for rate limiting behind a reverse proxy.
// Off by default: the server may be exposed directly, and blindly trusting
// X-Forwarded-For lets anyone rotate IPs to bypass rate limits. Set
// TRUST_PROXY=true only when a real reverse proxy (e.g. the docker client
// nginx) is in front of this server.
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// ===== Global Middleware (order matters) =====

// 1. Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://accounts.google.com"],
      frameSrc: ["'self'", "https://accounts.google.com"],
      connectSrc: ["'self'", "https://accounts.google.com"],
      imgSrc: ["'self'", "data:", "https:"],
      // Google Fonts serves the stylesheet from googleapis and the woff2 files
      // from gstatic; without both, the Newsreader display face silently falls
      // back to a system serif in production.
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      // GitHub sign-in is a top-level redirect to github.com and back.
      formAction: ["'self'", "https://github.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  // Google Identity Services opens a popup that posts the credential back to
  // the opener, which a strict `same-origin` COOP severs.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));

// 2. Request ID tracking (adds X-Request-Id to every response)
app.use(requestId);

// 3. Response compression
app.use(compression());

// 4. Request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// 5. CORS - restrict in production
const { isOriginAllowed } = require('./config/cors');

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

// Initialize Socket.io
const io = initializeSocket(server);
app.set('io', io);

// Static files for uploads — random names are unguessable; nosniff blocks
// MIME sniffing so a stray HTML/SVG file can't run in the browser.
// Served as attachments under a sandboxed (opaque-origin) CSP so even a
// smuggled HTML/SVG file downloads instead of executing in our origin.
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Content-Security-Policy', 'sandbox');
  },
}));

// ===== Built Client (SPA) =====
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));

// ===== Health Check (rate limited) =====
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    requestId: req.requestId,
  });
});

// ===== Development Diagnostics =====
app.use('/api/system', systemRoutes);

// ===== Rate Limited Routes =====
app.use('/api/auth', authRoutes);
app.use('/api/tasks', apiLimiter, taskRoutes);
app.use('/api/notifications', apiLimiter, notificationRoutes);

// New feature routes
app.use('/api/templates', apiLimiter, templateRoutes);
app.use('/api/calendar', apiLimiter, calendarRoutes);
app.use('/api/time-tracking', apiLimiter, timeTrackingRoutes);
app.use('/api/growth', apiLimiter, growthRoutes);

app.use('/api/ai', aiLimiter, aiRoutes);

// AI Settings routes (protected, rate limited)
const aiSettingsRoutes = require('./routes/aiSettingsRoutes');
app.use('/api/auth/ai-settings', apiLimiter, aiSettingsRoutes);

// File upload route (protected + rate limited)
const { protect } = require('./middleware/auth');
app.post('/api/upload', protect, uploadLimiter, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  res.json({
    filename: req.file.filename,
    originalName: req.file.originalname,
    path: `/uploads/${req.file.filename}`,
    size: req.file.size,
    mimeType: req.file.mimetype,
  });
});

// Recurring tasks check (runs every hour). The `running` flag skips a tick
// while the previous one is still in flight — with >1 replica each instance
// still runs its own sweep, but a slow sweep never stacks up locally.
const { processRecurringTasks, purgeExpiredTrash } = require('./controllers/taskController');
let recurringRunning = false;
setInterval(() => {
  if (recurringRunning) return;
  recurringRunning = true;
  processRecurringTasks()
    .catch(err => logger.error('Recurring task processing failed:', err))
    .finally(() => { recurringRunning = false; });
}, 60 * 60 * 1000);

// Trash retention sweep (runs every 6 hours). Soft-deleted tasks are restorable
// for 30 days; this is what makes that promise finite.
let purgeRunning = false;
setInterval(() => {
  if (purgeRunning) return;
  purgeRunning = true;
  purgeExpiredTrash()
    .catch(err => logger.error('Trash purge failed:', err))
    .finally(() => { purgeRunning = false; });
}, 6 * 60 * 60 * 1000);

// ===== API Documentation (rate limited) =====
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
app.use('/api/docs', apiLimiter, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'TaskFlow API Docs',
}));

app.get('/api/docs.json', apiLimiter, (req, res) => res.json(swaggerSpec));

// ===== SPA Fallback (serve index.html for any non-API route) =====
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ message: 'API endpoint not found' });
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ===== Error Handler (must be last) =====
app.use(errorHandler);

// ===== Connect to DB and Start Server =====
connectDB().then(async () => {
  try {
    await migrateUsernames();
  } catch (err) {
    logger.error('Username migration failed:', err);
  }
  server.listen(parsedPort, () => {
    logger.info(`Server running at http://localhost:${parsedPort}`);
    logger.info(`WebSocket server initialized`);
    logger.info(`API Docs available at http://localhost:${parsedPort}/api/docs`);
  });

  // Daily reset of focus time
  let focusResetRunning = false;
  setInterval(async () => {
    if (focusResetRunning) return;
    focusResetRunning = true;
    try {
      const User = require('./models/User');
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      await User.updateMany(
        { lastActiveDate: { $lt: new Date(yesterday) } },
        { focusTimeToday: 0 }
      );
    } catch (err) {
      logger.error('Daily focus time reset failed:', err);
    } finally {
      focusResetRunning = false;
    }
  }, 60 * 60 * 1000);

  // Due-soon / overdue notification reminders (every 15 minutes)
  const { processDueDateNotifications } = require('./services/notificationScheduler');
  processDueDateNotifications().catch((err) =>
    logger.error('Initial notification reminder run failed:', err)
  );
  let notifyRunning = false;
  setInterval(() => {
    if (notifyRunning) return;
    notifyRunning = true;
    processDueDateNotifications()
      .catch((err) => logger.error('Notification reminder run failed:', err))
      .finally(() => { notifyRunning = false; });
  }, 15 * 60 * 1000);

  setupGracefulShutdown(server, io);
});
