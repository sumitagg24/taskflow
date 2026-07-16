const mongoose = require('mongoose');
const logger = require('./logger');

const DRAIN_TIMEOUT_MS = 10_000; // give in-flight requests up to 10s to finish

function setupGracefulShutdown(server, io) {
  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections immediately.
    server.close(() => {
      logger.info('HTTP server closed (all connections drained).');
    });

    // Give in-flight HTTP requests up to 10 seconds to finish, then force exit.
    const forceExit = setTimeout(() => {
      logger.warn('Graceful shutdown timed out — forcing exit.');
      process.exit(1);
    }, DRAIN_TIMEOUT_MS);
    forceExit.unref();

    // Close Socket.io connections.
    if (io) {
      io.close(() => {
        logger.info('WebSocket server closed.');
      });
    }

    // Close MongoDB connection.
    try {
      await mongoose.connection.close();
      logger.info('MongoDB connection closed.');
    } catch (err) {
      logger.error('Error closing MongoDB:', err.message);
    }

    clearTimeout(forceExit);
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err.message);
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled Rejection:', err.message);
    shutdown('unhandledRejection');
  });
}

module.exports = { setupGracefulShutdown };
