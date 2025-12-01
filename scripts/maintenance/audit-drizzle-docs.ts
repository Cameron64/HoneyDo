#!/usr/bin/env node
/**
 * audit-drizzle-docs.ts
 *
 * Extracts all Drizzle table names from the codebase and compares them
 * against documentation in CLAUDE.md files.
 *
 * Usage:
 *   pnpm exec tsx scripts/maintenance/audit-drizzle-docs.ts
 *
 * Output:
 *   - Lists all tables found in schema files
 *   - Lists all tables documented in db/CLAUDE.md
 *   - Shows undocumented tables (in code but not docs)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const SCHEMA_DIR = path.join(PROJECT_ROOT, 'apps/api/src/db/schema');
const DB_DOC_FILE = path.join(PROJECT_ROOT, 'apps/api/src/db/CLAUDE.md');
const ROOT_DOC_FILE = path.join(PROJECT_ROOT, 'CLAUDE.md');

interface TableInfo {
  variableName: string;  // e.g., shoppingItems
  tableName: string;     // e.g., shopping_items
  file: string;
}

interface AuditResult {
  tables: TableInfo[];
  documentedTables: Set<string>;
  undocumented: TableInfo[];
}

function findSchemaFiles(): string[] {
  if (!fs.existsSync(SCHEMA_DIR)) {
    console.error(`Schema directory not found: ${SCHEMA_DIR}`);
    return [];
  }

  return fs.readdirSync(SCHEMA_DIR)
    .filter(file => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .map(file => path.join(SCHEMA_DIR, file));
}

function extractTablesFromSchema(filePath: string): TableInfo[] {
  const tables: TableInfo[] = [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  // Match: export const variableName = sqliteTable('table_name', { ... })
  const pattern = /export\s+const\s+(\w+)\s*=\s*sqliteTable\s*\(\s*['"](\w+)['"]/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    tables.push({
      variableName: match[1],
      tableName: match[2],
      file: fileName,
    });
  }

  return tables;
}

function extractDocumentedTables(filePath: string): Set<string> {
  const tables = new Set<string>();

  if (!fs.existsSync(filePath)) {
    return tables;
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Pattern 1: sqliteTable('table_name' - exact table name references
  const sqliteTablePattern = /sqliteTable\s*\(\s*['"](\w+)['"]/g;
  let match;
  while ((match = sqliteTablePattern.exec(content)) !== null) {
    tables.add(match[1]);
  }

  // Pattern 2: Table names in backticks that look like snake_case db tables
  const backtickPattern = /`(\w+_\w+)`/g;
  while ((match = backtickPattern.exec(content)) !== null) {
    const name = match[1];
    // Only add if it looks like a table name (snake_case, common prefixes)
    if (name.includes('_') && !name.includes('idx') && !name.includes('fk')) {
      tables.add(name);
    }
  }

  // Pattern 3: Variable names like shoppingItems, haEntities in code examples
  const variablePattern = /export\s+const\s+(\w+)\s*=/g;
  while ((match = variablePattern.exec(content)) !== null) {
    tables.add(match[1]);
  }

  return tables;
}

function auditDatabase(): AuditResult {
  const schemaFiles = findSchemaFiles();
  const allTables: TableInfo[] = [];

  for (const file of schemaFiles) {
    allTables.push(...extractTablesFromSchema(file));
  }

  // Combine docs from db/CLAUDE.md and root CLAUDE.md
  const documentedTables = new Set<string>();
  for (const table of extractDocumentedTables(DB_DOC_FILE)) {
    documentedTables.add(table);
  }
  for (const table of extractDocumentedTables(ROOT_DOC_FILE)) {
    documentedTables.add(table);
  }

  // Find undocumented tables
  const undocumented = allTables.filter(table => {
    // Check if either the variable name or table name is documented
    return !documentedTables.has(table.tableName) &&
           !documentedTables.has(table.variableName);
  });

  return {
    tables: allTables,
    documentedTables,
    undocumented,
  };
}

function printResults(result: AuditResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('Drizzle Database Schema Documentation Audit');
  console.log('='.repeat(60) + '\n');

  // Group tables by file
  const byFile = new Map<string, TableInfo[]>();
  for (const table of result.tables) {
    const existing = byFile.get(table.file) || [];
    existing.push(table);
    byFile.set(table.file, existing);
  }

  console.log('📊 Schema Files:');
  for (const [file, tables] of byFile) {
    console.log(`   ${file}: ${tables.length} tables`);
  }

  console.log(`\n📋 Total Tables in Code: ${result.tables.length}`);

  console.log('\n' + '-'.repeat(40));
  console.log('Tables by Schema File:');
  console.log('-'.repeat(40));

  for (const [file, tables] of byFile) {
    console.log(`\n  ${file}:`);
    for (const table of tables) {
      const status = result.undocumented.includes(table) ? '⚠️ ' : '✅';
      console.log(`    ${status} ${table.variableName} ('${table.tableName}')`);
    }
  }

  if (result.undocumented.length > 0) {
    console.log('\n' + '-'.repeat(40));
    console.log(`⚠️  UNDOCUMENTED TABLES (${result.undocumented.length}):`);
    console.log('-'.repeat(40));

    for (const table of result.undocumented) {
      console.log(`  - ${table.variableName} ('${table.tableName}') in ${table.file}`);
    }
    console.log('\n  → Add to apps/api/src/db/CLAUDE.md');
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  if (result.undocumented.length === 0) {
    console.log('  ✅ All database tables are documented!');
  } else {
    console.log(`  Undocumented tables: ${result.undocumented.length}`);
    console.log('\n  Action: Update apps/api/src/db/CLAUDE.md');
  }
  console.log('');
}

// Main execution
function main(): void {
  const result = auditDatabase();
  printResults(result);

  const hasIssues = result.undocumented.length > 0;
  process.exit(hasIssues ? 1 : 0);
}

main();
