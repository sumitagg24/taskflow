#!/usr/bin/env node
// Backup smoke check — read-only, no credentials in the repo.
//
// Verifies the backup source is reachable and enumerable before you depend on
// it: connects with MONGO_URI from the environment, runs an admin ping, and
// counts collections. It never writes, never dumps data, and never prints
// the connection string (failures are scrubbed the same way).
//
// Usage (from the repo root):
//   MONGO_URI="mongodb://127.0.0.1:27017/taskflow" node scripts/backup-smoke.cjs
//
// Exit codes: 0 = reachable, 1 = ping/count failure, 2 = misconfiguration.
const path = require('path');

function scrub(text) {
  return String(text)
    .replace(/mongodb(\+srv)?:\/\/\S+/gi, '[redacted-uri]')
    .replace(/[A-Za-z]:\\[^\s"'`]*/g, '[redacted-path]');
}

function loadMongoose() {
  try {
    return require('mongoose');
  } catch {
    // Repo layout keeps backend deps under server/ — resolve from there.
    return require(path.join(__dirname, '..', 'server', 'node_modules', 'mongoose'));
  }
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set. Export it first (see server/.env, never commit it).');
    process.exit(2);
  }

  let mongoose;
  try {
    mongoose = loadMongoose();
  } catch (err) {
    console.error(`Could not load mongoose: ${scrub(err && err.message ? err.message : err)}`);
    process.exit(2);
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    const db = mongoose.connection.db;
    const ping = await db.admin().ping();
    const collections = await db.listCollections().toArray();
    console.log(
      JSON.stringify({
        ok: true,
        ping,
        database: db.databaseName,
        collections: collections.length,
        names: collections.map((c) => c.name).sort(),
      })
    );
  } catch (err) {
    console.error(`Backup smoke check failed: ${scrub(err && err.message ? err.message : err)}`);
    process.exit(1);
  } finally {
    try {
      await mongoose.disconnect();
    } catch {
      // Disconnect failures after a successful check are irrelevant.
    }
  }
}

main();
