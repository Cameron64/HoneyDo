import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const databaseUrl = process.env.DATABASE_URL ?? './data/honeydo.db';

const sqlite = new Database(databaseUrl);

// Enable WAL mode for better concurrent performance
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
