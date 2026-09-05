const { Server } = require('socket.io');
const { verifyAccessToken } = require('../middleware/auth');
const { isOriginAllowed } = require('../config/cors');
const logger = require('../utils/logger');
const User = require('../models/User');

let io = null;

function initializeSocket(server) {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
    },
  });

  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const decoded = verifyAccessToken(token);
      if (decoded.token_type !== 'access' && decoded.type !== 'access') {
        return next(new Error('Invalid token type'));
      }
      const user = await User.findById(decoded.id).select('_id emailVerified passwordChangedAt');
      if (!user) {
        logger.warn(`Socket auth failed: user not found for id ${decoded.id}`);
        return next(new Error('User not found'));
      }
      // Reject access tokens issued before the password last changed —
      // a password change/reset revokes all previously-issued sessions.
      if (user.passwordChangedAt && decoded.iat) {
        const issuedAtMs = decoded.iat * 1000;
        if (issuedAtMs < user.passwordChangedAt.getTime()) {
          logger.warn(`Socket auth failed: stale token for user ${user._id}`);
          return next(new Error('Session expired, please sign in again'));
        }
      }
      if (!user.emailVerified) {
        logger.warn(`Socket auth failed: email not verified for user ${user._id}`);
        return next(new Error('Please verify your email before accessing this resource.'));
      }
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.userId}`);

    // Join user's personal room for targeted events
    socket.join(`user:${socket.userId}`);

    // Handle real-time updates — validate payloads to prevent abuse
    socket.on('task:move', (data) => {
      // Only accept safe primitive fields; reject objects/arrays to prevent
      // mass assignment or prototype pollution from malicious clients.
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return;
      const safe = {
        taskId: typeof data.taskId === 'string' ? data.taskId : undefined,
        fromStatus: typeof data.fromStatus === 'string' ? data.fromStatus : undefined,
        toStatus: typeof data.toStatus === 'string' ? data.toStatus : undefined,
        order: typeof data.order === 'number' ? data.order : undefined,
      };
      socket.to(`user:${socket.userId}`).emit('task:moved', safe);
    });

    socket.on('task:update', (data) => {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return;
      // Forward only known-safe fields; drop anything unexpected.
      const safe = {
        _id: typeof data._id === 'string' ? data._id : undefined,
        status: typeof data.status === 'string' ? data.status : undefined,
        priority: typeof data.priority === 'string' ? data.priority : undefined,
        order: typeof data.order === 'number' ? data.order : undefined,
      };
      socket.to(`user:${socket.userId}`).emit('task:updated', safe);
    });

    socket.on('collaboration:cursor', (data) => {
      if (typeof data !== 'object' || data === null || Array.isArray(data)) return;
      const safe = {
        x: typeof data.x === 'number' ? data.x : undefined,
        y: typeof data.y === 'number' ? data.y : undefined,
        taskId: typeof data.taskId === 'string' ? data.taskId : undefined,
      };
      socket.to(`user:${socket.userId}`).emit('collaboration:cursor', {
        userId: socket.userId,
        ...safe,
      });
    });

    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${socket.userId}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

module.exports = { initializeSocket, getIO };
