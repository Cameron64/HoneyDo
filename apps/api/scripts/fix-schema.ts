/**
 * Fix accepted_meals schema and reset wizard session
 */
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Server uses ./data/honeydo.db relative to apps/api (i.e., apps/api/data/honeydo.db)
const dbPath = path.resolve(__dirname, '../data/honeydo.db');
console.log('Database path:', dbPath);

const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = OFF');

console.log('Fixing accepted_meals table with nullable suggestion_index...');

// Check if accepted_meals exists
const acceptedMealsExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='accepted_meals'
`).get();

// Check if accepted_meals_new exists (from previous failed run)
const newTableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='accepted_meals_new'
`).get();

if (newTableExists && !acceptedMealsExists) {
  // Previous run created new table but didn't rename it
  console.log('Found accepted_meals_new from previous run, renaming it...');
  db.exec(`ALTER TABLE accepted_meals_new RENAME TO accepted_meals;`);
} else if (!acceptedMealsExists) {
  // Table doesn't exist at all, create it fresh
  console.log('Creating accepted_meals table from scratch...');
  db.exec(`
    CREATE TABLE accepted_meals (
      id text PRIMARY KEY NOT NULL,
      suggestion_id text,
      suggestion_index integer,
      batch_id text,
      date text NOT NULL,
      meal_type text NOT NULL,
      recipe_name text NOT NULL,
      recipe_data text NOT NULL,
      servings integer NOT NULL,
      shopping_list_generated integer DEFAULT 0 NOT NULL,
      completed integer DEFAULT 0 NOT NULL,
      completed_at text,
      is_rollover integer DEFAULT 0 NOT NULL,
      rollover_from_batch_id text,
      is_manual_pick integer DEFAULT 0 NOT NULL,
      is_audible integer DEFAULT 0 NOT NULL,
      replaced_meal_id text,
      rating integer,
      user_notes text,
      created_at text DEFAULT (datetime('now')) NOT NULL,
      updated_at text DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (suggestion_id) REFERENCES meal_suggestions(id) ON DELETE SET NULL,
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL
    );
  `);
} else {
  // Table exists, recreate it
  console.log('Recreating accepted_meals table...');

  // Drop temp table if it exists from previous failed run
  db.exec(`DROP TABLE IF EXISTS accepted_meals_new;`);

  // Create new table with correct schema
  db.exec(`
    CREATE TABLE accepted_meals_new (
      id text PRIMARY KEY NOT NULL,
      suggestion_id text,
      suggestion_index integer,
      batch_id text,
      date text NOT NULL,
      meal_type text NOT NULL,
      recipe_name text NOT NULL,
      recipe_data text NOT NULL,
      servings integer NOT NULL,
      shopping_list_generated integer DEFAULT 0 NOT NULL,
      completed integer DEFAULT 0 NOT NULL,
      completed_at text,
      is_rollover integer DEFAULT 0 NOT NULL,
      rollover_from_batch_id text,
      is_manual_pick integer DEFAULT 0 NOT NULL,
      is_audible integer DEFAULT 0 NOT NULL,
      replaced_meal_id text,
      rating integer,
      user_notes text,
      created_at text DEFAULT (datetime('now')) NOT NULL,
      updated_at text DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (suggestion_id) REFERENCES meal_suggestions(id) ON DELETE SET NULL,
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL
    );
  `);

  // Copy data
  db.exec(`INSERT OR IGNORE INTO accepted_meals_new SELECT * FROM accepted_meals;`);

  // Drop old, rename new
  db.exec(`DROP TABLE accepted_meals;`);
  db.exec(`ALTER TABLE accepted_meals_new RENAME TO accepted_meals;`);
}

// Recreate indexes
db.exec(`CREATE INDEX IF NOT EXISTS idx_accepted_meals_date ON accepted_meals (date);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_accepted_meals_date_type ON accepted_meals (date, meal_type);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_accepted_meals_suggestion ON accepted_meals (suggestion_id);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_accepted_meals_batch ON accepted_meals (batch_id);`);

console.log('Schema fixed!');

// Check if wizard_sessions exists
const wizardTableExists = db.prepare(`
  SELECT name FROM sqlite_master WHERE type='table' AND name='wizard_sessions'
`).get();

if (wizardTableExists) {
  // Reset wizard session
  console.log('Resetting wizard sessions...');
  const deleteResult = db.prepare('DELETE FROM wizard_sessions').run();
  console.log(`Deleted ${deleteResult.changes} wizard sessions`);
} else {
  console.log('wizard_sessions table does not exist, creating it...');
  db.exec(`
    CREATE TABLE wizard_sessions (
      id text PRIMARY KEY NOT NULL,
      user_id text NOT NULL,
      current_step integer DEFAULT 1 NOT NULL,
      meal_dispositions text,
      rollover_count integer DEFAULT 0,
      total_meal_count integer,
      manual_pick_count integer DEFAULT 0,
      manual_pick_ids text DEFAULT '[]',
      target_meal_count integer,
      accepted_meal_ids text,
      current_suggestion_request_id text,
      selected_ingredients text,
      target_list_id text,
      new_batch_id text,
      previous_batch_id text,
      created_at text DEFAULT (datetime('now')) NOT NULL,
      updated_at text DEFAULT (datetime('now')) NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  console.log('wizard_sessions table created');
}

db.pragma('foreign_keys = ON');
db.close();

console.log('Done!');
