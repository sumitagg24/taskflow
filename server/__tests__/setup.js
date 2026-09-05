// Load .env but disable real services for tests
process.env.NODE_ENV = 'test';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-not-for-production';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

// Export app factory
const taskRoutes = require('../routes/taskRoutes');
const authRoutes = require('../routes/authRoutes');
const aiRoutes = require('../routes/aiRoutes');
const notificationRoutes = require('../routes/notificationRoutes');
const templateRoutes = require('../routes/templateRoutes');
const calendarRoutes = require('../routes/calendarRoutes');
const timeTrackingRoutes = require('../routes/timeTrackingRoutes');
const aiSettingsRoutes = require('../routes/aiSettingsRoutes');
const growthRoutes = require('../routes/growthRoutes');
const errorHandler = require('../middleware/errorHandler');
const requestId = require('../middleware/requestId');
const { apiLimiter, aiLimiter } = require('../middleware/rateLimiter');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('../config/swagger');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(requestId);
  app.use(compression());
  app.use(morgan('dev', { skip: () => process.env.NODE_ENV === 'test' }));
  app.use(cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(require('../middleware/csrf'));

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), requestId: req.requestId });
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/tasks', apiLimiter, taskRoutes);
  app.use('/api/notifications', apiLimiter, notificationRoutes);
  app.use('/api/templates', apiLimiter, templateRoutes);
  app.use('/api/calendar', apiLimiter, calendarRoutes);
  app.use('/api/time-tracking', apiLimiter, timeTrackingRoutes);
  app.use('/api/growth', apiLimiter, growthRoutes);
  app.use('/api/ai', aiLimiter, aiRoutes);
  app.use('/api/auth/ai-settings', apiLimiter, aiSettingsRoutes);

  // Swagger
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'TaskFlow API Docs',
  }));
  app.get('/api/docs.json', (req, res) => res.json(swaggerSpec));

  // Error handler
  app.use(errorHandler);

  return app;
}

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

module.exports = { createApp };
