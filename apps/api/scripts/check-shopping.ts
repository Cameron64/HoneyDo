import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = resolve(__dirname, '../data/honeydo.db');
const db = new Database(dbPath);

console.log('Database path:', dbPath);
console.log('');

// Check shopping lists
const lists = db.prepare('SELECT * FROM shopping_lists').all();
console.log('Shopping Lists:', lists.length);
if (lists.length > 0) {
  console.log(JSON.stringify(lists, null, 2));
}
console.log('');

// Check shopping items
const items = db.prepare('SELECT * FROM shopping_items').all();
console.log('Shopping Items:', items.length);

// Count items per list
const itemsPerList = db.prepare(`
  SELECT list_id, COUNT(*) as count
  FROM shopping_items
  GROUP BY list_id
`).all();
console.log('\nItems per list:');
console.log(JSON.stringify(itemsPerList, null, 2));

// Get the default list items
const defaultList = lists.find((l: { is_default: number }) => l.is_default === 1);
if (defaultList) {
  console.log('\n--- DEFAULT LIST ITEMS ---');
  console.log('Default list ID:', (defaultList as { id: string }).id);
  const defaultItems = db.prepare('SELECT id, name, checked FROM shopping_items WHERE list_id = ?').all((defaultList as { id: string }).id);
  console.log('Default list items:', defaultItems.length);
  console.log(JSON.stringify(defaultItems.slice(0, 10), null, 2));
}

db.close();
