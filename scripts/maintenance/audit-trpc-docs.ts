#!/usr/bin/env node
/**
 * audit-trpc-docs.ts
 *
 * Extracts all tRPC procedure names from the codebase and compares them
 * against documentation in CLAUDE.md files.
 *
 * Usage:
 *   pnpm exec tsx scripts/maintenance/audit-trpc-docs.ts
 *
 * Output:
 *   - Lists all procedures found in code
 *   - Lists all procedures documented in CLAUDE.md
 *   - Shows undocumented procedures (in code but not docs)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

interface ProcedureInfo {
  name: string;
  submodule: string;
  fullPath: string;
}

interface AuditResult {
  module: string;
  codeDir: string;
  docFile: string;
  procedures: ProcedureInfo[];
  documentedProcedures: string[];
  undocumented: ProcedureInfo[];
}

// Module configurations
const MODULES = [
  {
    name: 'shopping',
    codeDir: 'apps/api/src/modules/shopping',
    docFile: 'apps/api/src/modules/shopping/CLAUDE.md',
  },
  {
    name: 'home',
    codeDir: 'apps/api/src/modules/home',
    docFile: 'apps/api/src/modules/home/CLAUDE.md',
  },
  {
    name: 'recipes',
    codeDir: 'apps/api/src/modules/recipes',
    docFile: 'apps/api/src/modules/recipes/CLAUDE.md',
  },
];

// Skip these - they're router compositions, not procedures
const SKIP_NAMES = new Set([
  'router', 'trpc', 'ctx', 'input', 'query', 'mutation',
  'lists', 'items', 'ai', 'config', 'entities', 'actions',
  'favorites', 'scenes', 'preferences', 'suggestions', 'meals',
  'shopping', 'schedule',
]);

function findFilesRecursively(dir: string, pattern: RegExp): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findFilesRecursively(fullPath, pattern));
    } else if (pattern.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractProceduresFromCode(filePath: string, moduleDir: string): ProcedureInfo[] {
  const procedures: ProcedureInfo[] = [];

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const relativePath = path.relative(moduleDir, filePath);
  const submodule = path.basename(path.dirname(filePath));

  // Match procedure definitions: procedureName: protectedProcedure/publicProcedure/adminProcedure
  const pattern = /(\w+):\s*(protectedProcedure|publicProcedure|adminProcedure)/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    const procedureName = match[1];
    if (!SKIP_NAMES.has(procedureName.toLowerCase())) {
      procedures.push({
        name: procedureName,
        submodule,
        fullPath: `${submodule}.${procedureName}`,
      });
    }
  }

  return procedures;
}

function extractDocumentedProcedures(filePath: string, moduleName: string): string[] {
  const procedures: Set<string> = new Set();

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Pattern 1: trpc.module.submodule.procedure - most reliable
  const trpcPattern = new RegExp(`trpc\\.${moduleName}\\.(\\w+)\\.(\\w+)`, 'g');
  let match;
  while ((match = trpcPattern.exec(content)) !== null) {
    procedures.add(`${match[1]}.${match[2]}`);
  }

  // Pattern 2: .submodule.procedure.useQuery/useMutation
  const hookPattern = /\.(\w+)\.(\w+)\.(useQuery|useMutation)/g;
  while ((match = hookPattern.exec(content)) !== null) {
    if (!SKIP_NAMES.has(match[1].toLowerCase()) && !SKIP_NAMES.has(match[2].toLowerCase())) {
      procedures.add(`${match[1]}.${match[2]}`);
    }
  }

  return Array.from(procedures).sort();
}

function auditModule(config: typeof MODULES[0]): AuditResult {
  const codeDir = path.join(PROJECT_ROOT, config.codeDir);
  const docFile = path.join(PROJECT_ROOT, config.docFile);

  // Find all router files
  const routerFiles = findFilesRecursively(codeDir, /router\.ts$/);
  const allProcedures: ProcedureInfo[] = [];

  for (const file of routerFiles) {
    allProcedures.push(...extractProceduresFromCode(file, codeDir));
  }

  const documentedProcedures = extractDocumentedProcedures(docFile, config.name);

  // Find undocumented procedures
  const undocumented = allProcedures.filter(proc => {
    return !documentedProcedures.some(doc => {
      const docParts = doc.split('.');
      const docProcName = docParts[docParts.length - 1];
      return doc === proc.fullPath ||
             docProcName === proc.name ||
             doc.includes(proc.name);
    });
  });

  return {
    module: config.name,
    codeDir: config.codeDir,
    docFile: config.docFile,
    procedures: allProcedures,
    documentedProcedures,
    undocumented,
  };
}

function printResults(results: AuditResult[]): void {
  console.log('\n' + '='.repeat(60));
  console.log('tRPC Procedure Documentation Audit');
  console.log('='.repeat(60) + '\n');

  let totalProcedures = 0;
  let totalUndocumented = 0;

  for (const result of results) {
    console.log(`\n📦 Module: ${result.module.toUpperCase()}`);
    console.log('-'.repeat(40));

    console.log(`  Procedures in code: ${result.procedures.length}`);
    console.log(`  Documented patterns: ${result.documentedProcedures.length}`);

    // Group by submodule
    const bySubmodule = new Map<string, ProcedureInfo[]>();
    for (const proc of result.procedures) {
      const existing = bySubmodule.get(proc.submodule) || [];
      existing.push(proc);
      bySubmodule.set(proc.submodule, existing);
    }

    console.log('\n  Procedures by submodule:');
    for (const [submodule, procs] of bySubmodule) {
      console.log(`    ${submodule}: ${procs.map(p => p.name).join(', ')}`);
    }

    if (result.undocumented.length > 0) {
      console.log(`\n  ⚠️  UNDOCUMENTED (${result.undocumented.length}):`);
      for (const proc of result.undocumented) {
        console.log(`      - ${proc.fullPath}`);
      }
      totalUndocumented += result.undocumented.length;
    } else {
      console.log('\n  ✅ All procedures documented!');
    }

    totalProcedures += result.procedures.length;
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total procedures: ${totalProcedures}`);
  console.log(`  Undocumented: ${totalUndocumented}`);

  if (totalUndocumented > 0) {
    console.log('\n  Action: Update CLAUDE.md files in relevant modules');
    console.log('  Add entries like: trpc.module.submodule.procedureName');
  } else {
    console.log('\n  ✅ All procedures are documented!');
  }
  console.log('');
}

// Main execution
function main(): void {
  const results = MODULES.map(auditModule);
  printResults(results);

  // Only fail on undocumented procedures (not "stale" docs)
  const hasIssues = results.some(r => r.undocumented.length > 0);
  process.exit(hasIssues ? 1 : 0);
}

main();
