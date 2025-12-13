# HoneyDo Scripts - Claude Code Instructions

> Utility scripts for development, maintenance, and data management

## Overview

This directory contains standalone scripts for various tasks that don't fit into the main application code. These are typically run manually or via npm scripts.

## Directory Structure

```
scripts/
├── CLAUDE.md                  # This file
├── maintenance/               # Scheduled maintenance scripts
├── backup.sh                  # Database backup
├── restore.sh                 # Database restore
├── generate-pwa-icons.mjs     # PWA icon generation
├── https-server.mjs           # HTTPS dev server
├── pwa-server.mjs             # PWA testing server
├── check-stats.js             # Recipe statistics
├── enhance-recipes.js         # Recipe data enhancement
├── migrate-recipe-metadata.js # Recipe metadata migration
├── recipe-query.js            # Query recipes from CLI
├── scrape-recipe.py           # Python recipe scraper
├── scrape-recipes.js          # JS recipe scraper
├── test-archive.js            # Archive testing
├── test-extract.js            # Extraction testing
├── update-accepted-meals.js   # Update meal data
└── verify-ingredients.js      # Ingredient verification
```

## Script Categories

### Database Scripts

| Script | Purpose | Usage |
|--------|---------|-------|
| `backup.sh` | Create SQLite database backup | `./scripts/backup.sh` |
| `restore.sh` | Restore database from backup | `./scripts/restore.sh backup.db` |

```bash
# Backup database
./scripts/backup.sh

# Creates: backups/honeydo-YYYYMMDD-HHMMSS.db
```

### PWA Development

| Script | Purpose | Usage |
|--------|---------|-------|
| `generate-pwa-icons.mjs` | Generate PWA icons from source | `node scripts/generate-pwa-icons.mjs` |
| `pwa-server.mjs` | Serve PWA for testing | `node scripts/pwa-server.mjs` |
| `https-server.mjs` | Local HTTPS for testing | `node scripts/https-server.mjs` |

```bash
# Generate all PWA icon sizes
node scripts/generate-pwa-icons.mjs

# Test PWA installation locally
node scripts/pwa-server.mjs
```

### Recipe Data Management

| Script | Purpose | Usage |
|--------|---------|-------|
| `recipe-query.js` | Query recipes from CLI | `node scripts/recipe-query.js "pasta"` |
| `scrape-recipes.js` | Scrape recipes from URLs | `node scripts/scrape-recipes.js urls.txt` |
| `scrape-recipe.py` | Python-based scraper | `python scripts/scrape-recipe.py URL` |
| `enhance-recipes.js` | Add metadata to recipes | `node scripts/enhance-recipes.js` |
| `migrate-recipe-metadata.js` | Migrate recipe format | `node scripts/migrate-recipe-metadata.js` |
| `verify-ingredients.js` | Verify ingredient data | `node scripts/verify-ingredients.js` |
| `check-stats.js` | Show recipe statistics | `node scripts/check-stats.js` |
| `update-accepted-meals.js` | Update meal records | `node scripts/update-accepted-meals.js` |

```bash
# Query recipes
node scripts/recipe-query.js "chicken"

# Show stats
node scripts/check-stats.js
# Output: Total recipes: 50, Cuisines: 12, Avg time: 45min

# Scrape a recipe URL (Python)
python scripts/scrape-recipe.py https://example.com/recipe

# Verify all ingredients have categories
node scripts/verify-ingredients.js
```

### Testing Utilities

| Script | Purpose |
|--------|---------|
| `test-archive.js` | Test archive functionality |
| `test-extract.js` | Test data extraction |

## Running Scripts

### Node.js Scripts

```bash
# From project root
node scripts/script-name.js [args]

# With pnpm
pnpm exec node scripts/script-name.js

# ESM modules (with .mjs extension)
node scripts/script-name.mjs
```

### Shell Scripts

```bash
# Make executable (first time)
chmod +x scripts/backup.sh

# Run
./scripts/backup.sh
```

### Python Scripts

```bash
# Ensure Python is installed
python scripts/scrape-recipe.py URL
```

## Writing New Scripts

### Node.js Script Template

```javascript
#!/usr/bin/env node
// scripts/my-script.js

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node scripts/my-script.js <arg>');
    process.exit(1);
  }

  try {
    // Script logic here
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
```

### Shell Script Template

```bash
#!/bin/bash
# scripts/my-script.sh

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <arg>"
    exit 1
fi

# Script logic here
echo "Done!"
```

## Environment Variables

Scripts may need access to project environment variables:

```javascript
import dotenv from 'dotenv';
import path from 'path';

// Load from api .env
dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

const apiKey = process.env.ANTHROPIC_API_KEY;
```

## Data File Locations

Scripts often work with these data files:

| File | Path | Purpose |
|------|------|---------|
| Database | `apps/api/data/honeydo.db` | SQLite database |
| Recipe history | `data/recipes/history.json` | Recipe library |
| Backups | `backups/` | Database backups |

## Maintenance Scripts

The `maintenance/` subdirectory contains scheduled tasks:

```
scripts/maintenance/
└── cleanup-old-sessions.js    # Clean expired wizard sessions
```

Run maintenance tasks periodically:
```bash
# Via cron or scheduled task
node scripts/maintenance/cleanup-old-sessions.js
```

## Best Practices

1. **Exit Codes**: Return 0 for success, non-zero for errors
2. **Help Text**: Show usage when run without required args
3. **Idempotent**: Scripts should be safe to run multiple times
4. **Logging**: Use console.log/error with timestamps for long operations
5. **Dry Run**: Add `--dry-run` flag for destructive operations

```javascript
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  console.log('[DRY RUN] Would delete:', items.length, 'items');
} else {
  await deleteItems(items);
}
```

## Files to Reference

- Recipe history service: `apps/api/src/services/recipe-history.ts`
- Database schema: `apps/api/src/db/schema/`
- Shared types: `packages/shared/src/types/`
