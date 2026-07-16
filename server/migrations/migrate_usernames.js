/**
 * Migration: Generate usernames for existing users
 * 
 * This script finds users without usernames and generates them from email addresses.
 * Handles collisions by appending numbers.
 * 
 * Run with: node migrations/migrate_usernames.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const User = require('../models/User');
const logger = require('../utils/logger');

async function migrateUsernames() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/task-tracker');
    logger.info('Connected to MongoDB');

    // Find users without usernames or with undefined/null username
    const usersWithoutUsername = await User.find({
      $or: [
        { username: { $exists: false } },
        { username: null },
        { username: '' }
      ]
    });

    logger.info(`Found ${usersWithoutUsername.length} users without usernames`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const user of usersWithoutUsername) {
      let baseUsername = '';
      
      if (user.email) {
        // Generate username from email (part before @)
        baseUsername = user.email.split('@')[0]
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .replace(/_+/g, '_')
          .slice(0, 30);
      } else {
        // Fallback if no email
        baseUsername = `user_${user._id.toString().slice(-8)}`;
      }

      // Ensure minimum length
      if (baseUsername.length < 3) {
        baseUsername = baseUsername.padEnd(3, '0');
      }

      // Find unique username
      let username = baseUsername;
      let counter = 1;
      let existingUser = await User.findOne({ username: username.toLowerCase() });

      while (existingUser && existingUser._id.toString() !== user._id.toString()) {
        const suffix = counter.toString();
        username = (baseUsername + '_' + suffix).slice(0, 30);
        counter++;
        existingUser = await User.findOne({ username: username.toLowerCase() });
      }

      // Update the user
      user.username = username.toLowerCase();
      await user.save();

      logger.info(`Migrated user ${user._id}: set username to "${username}"`);
      migratedCount++;
    }

    logger.info(`\nMigration complete!`);
    logger.info(`  - Migrated: ${migratedCount}`);
    logger.info(`  - Skipped: ${skippedCount}`);

  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB');
  }
}

migrateUsernames();