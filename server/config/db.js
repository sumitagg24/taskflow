const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const logger = require('../utils/logger');

// Kill any orphaned mongod still bound to our on-disk data path so a new
// instance can acquire the lock (e.g. after a nodemon/process restart).
// Only kills if mongod is actually running — never deletes a lock file
// belonging to a live process.
function killStaleMongods(dbPath) {
  try {
    if (process.platform === 'win32') {
      // Get process IDs of mongod instances that have this dbPath in their command line.
      // Only proceeds if at least one such process is found (avoids deleting the
      // lock file when no mongod is running against this path).
      const ps = spawnSync('powershell', ['-NoProfile', '-Command',
        `(Get-CimInstance Win32_Process -Filter "Name='mongod.exe'" | Where-Object { $_.CommandLine -like '*${dbPath.replace(/'/g, "''")}*' }).ProcessId`],
        { encoding: 'utf8' });
      const pids = (ps.stdout || '').toString().trim().split('\n').filter(Boolean);
      if (pids.length === 0) return; // no stale mongod — leave lock file alone
      for (const pid of pids) {
        spawnSync('Stop-Process', ['-Id', pid.trim(), '-Force'], { encoding: 'utf8' });
      }
    } else {
      // On Unix, pkill exits non-zero if no process matched — that's fine.
      spawnSync('pkill', ['-f', dbPath]);
    }
  } catch { /* best effort */ }
}

const connectDB = async () => {
  if (process.env.MONGO_URI) {
	
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
      logger.info(`MongoDB Connected: ${conn.connection.host}`);
      return;
    } catch (error) {
      // Log the full MongoDB driver error — message alone is insufficient for diagnosis.
      logger.error('=== MongoDB Atlas Connection Failure ===');
      logger.error(`[error.name]        : ${error.name}`);
      logger.error(`[error.message]     : ${error.message}`);
      if (error.code)       logger.error(`[error.code]        : ${error.code}`);
      if (error.codeName)   logger.error(`[error.codeName]    : ${error.codeName}`);
      if (error.cause) {
        logger.error(`[error.cause]       : ${error.cause}`);
      }
      if (error.reason) {
        const r = error.reason;
        logger.error(`[error.reason]      : ${r}`);
        if (r.message)   logger.error(`  reason.message    : ${r.message}`);
        if (r.name)      logger.error(`  reason.name       : ${r.name}`);
        if (r.code)      logger.error(`  reason.code       : ${r.code}`);
        if (r.codeName)  logger.error(`  reason.codeName   : ${r.codeName}`);
        if (r.connectionGeneration !== undefined) logger.error(`  reason.connectionGeneration: ${r.connectionGeneration}`);
        if (r.writeErrors) {
          logger.error(`  reason.writeErrors: ${JSON.stringify(r.writeErrors)}`);
        }
      }
      if (error.stack) {
        logger.error(`[error.stack]`);
        error.stack.split('\n').forEach(line => logger.error(`  ${line}`));
      }
      if (error.cause && error.cause.stack) {
        logger.error(`[error.cause.stack]`);
        error.cause.stack.split('\n').forEach(line => logger.error(`  ${line}`));
      }
      logger.error('==========================================');
      logger.info('Falling back to on-disk MongoDB...');
    }
  }

  // Use a persistent on-disk store so users/tasks survive server restarts.
  const dbPath = path.join(__dirname, '..', '.mongo-data');
  fs.mkdirSync(dbPath, { recursive: true });

  killStaleMongods(dbPath);

  // Clear a stale lock file left behind by an unclean shutdown so mongod can start.
  const lockFile = path.join(dbPath, 'mongod.lock');
  if (fs.existsSync(lockFile)) {
    try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
  }

  logger.info('Starting MongoMemoryServer with persistent storage...');
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create({
    instance: {
      dbPath,
      storageEngine: 'wiredTiger',
      launchTimeoutMs: 30000,
    },
    binary: {
      version: '7.0.24',
    },
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  logger.info('MongoDB On-Disk Started');
};

module.exports = connectDB;
