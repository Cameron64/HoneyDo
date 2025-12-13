/**
 * Migration script to add recipe selection columns
 * Run with: node scripts/add-recipe-selection-columns.js
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', 'data', 'honeydo.db');

const db = new Database(dbPath);

console.log('Adding recipe selection columns to database...');

// Check existing columns in wizard_sessions
const wizardCols = db.prepare("PRAGMA table_info(wizard_sessions)").all();
const wizardColNames = wizardCols.map(c => c.name);

// Add total_meal_count if not exists
if (!wizardColNames.includes('total_meal_count')) {
  console.log('Adding total_meal_count column...');
  db.exec('ALTER TABLE wizard_sessions ADD COLUMN total_meal_count INTEGER');
}

// Add manual_pick_count if not exists
if (!wizardColNames.includes('manual_pick_count')) {
  console.log('Adding manual_pick_count column...');
  db.exec('ALTER TABLE wizard_sessions ADD COLUMN manual_pick_count INTEGER DEFAULT 0');
}

// Add manual_pick_ids if not exists
if (!wizardColNames.includes('manual_pick_ids')) {
  console.log('Adding manual_pick_ids column...');
  db.exec("ALTER TABLE wizard_sessions ADD COLUMN manual_pick_ids TEXT DEFAULT '[]'");
}

// Check existing columns in accepted_meals
const mealsCols = db.prepare("PRAGMA table_info(accepted_meals)").all();
const mealsColNames = mealsCols.map(c => c.name);

// Add is_manual_pick if not exists
if (!mealsColNames.includes('is_manual_pick')) {
  console.log('Adding is_manual_pick column...');
  db.exec('ALTER TABLE accepted_meals ADD COLUMN is_manual_pick INTEGER DEFAULT 0 NOT NULL');
}

console.log('Migration complete!');
db.close();
