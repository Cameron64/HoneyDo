/**
 * Migration: Add rollover_count column to wizard_sessions
 *
 * This column tracks how many meals were rolled over from the previous batch.
 * The rollover count becomes the floor for the total meal count in Step 2a.
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '../data/honeydo.db');

const db = new Database(dbPath);

console.log('Adding rollover_count column to wizard_sessions table...');

try {
  // Check if column already exists
  const tableInfo = db.prepare("PRAGMA table_info('wizard_sessions')").all();
  const hasRolloverCount = tableInfo.some(col => col.name === 'rollover_count');

  if (hasRolloverCount) {
    console.log('Column rollover_count already exists, skipping.');
  } else {
    db.exec(`
      ALTER TABLE wizard_sessions ADD COLUMN rollover_count INTEGER DEFAULT 0;
    `);
    console.log('Successfully added rollover_count column.');
  }

  console.log('Migration completed successfully!');
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
