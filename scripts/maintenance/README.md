# Documentation Maintenance Scripts

This directory contains automation tools for maintaining CLAUDE.md documentation across the HoneyDo project.

## Quick Start

```bash
# Run all documentation audits
./scripts/maintenance/run-audit.sh

# Run specific audits
./scripts/maintenance/run-audit.sh trpc    # tRPC procedures
./scripts/maintenance/run-audit.sh db      # Database schemas
./scripts/maintenance/run-audit.sh docs    # CLAUDE.md files
```

## Scripts

### `run-audit.sh`

Master script that runs all documentation audits. Use this for regular maintenance checks.

**Usage:**
```bash
./scripts/maintenance/run-audit.sh [command]

Commands:
  all     Run all audits (default)
  trpc    Run tRPC procedure audit
  db      Run Drizzle schema audit
  docs    Run CLAUDE.md file check
  help    Show help message
```

### `check-claude-docs.sh`

Pre-commit hook script that warns when source files change without corresponding CLAUDE.md updates.

**Install as pre-commit hook:**
```bash
cp scripts/maintenance/check-claude-docs.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

**Features:**
- Detects changes to router, schema, and service files
- Maps source directories to their CLAUDE.md files
- Warns (but doesn't block) commits with missing doc updates
- Use `--strict` flag to block commits

### `audit-trpc-docs.ts`

Extracts tRPC procedure names from code and compares against documentation.

**Usage:**
```bash
pnpm exec tsx scripts/maintenance/audit-trpc-docs.ts
```

**Checks:**
- Finds all procedures in `apps/api/src/modules/*/router.ts`
- Compares against documentation in module CLAUDE.md files
- Reports undocumented procedures
- Reports stale documentation (documented but not in code)

### `audit-drizzle-docs.ts`

Extracts Drizzle table definitions and compares against documentation.

**Usage:**
```bash
pnpm exec tsx scripts/maintenance/audit-drizzle-docs.ts
```

**Checks:**
- Finds all tables in `apps/api/src/db/schema/*.ts`
- Compares against `apps/api/src/db/CLAUDE.md`
- Reports undocumented tables
- Reports stale documentation

## Maintenance Schedule

### Weekly (During Active Development)
- Run `./scripts/maintenance/run-audit.sh` after major feature work
- Update module-specific CLAUDE.md files for new procedures/tables

### Monthly
- Review layer files (db, shared, components CLAUDE.md)
- Check for pattern drift between docs and implementation

### Quarterly
- Full review of root CLAUDE.md and infrastructure docs
- Update epic status if needed
- Verify cross-references between files

## Update Triggers

Update the relevant CLAUDE.md file when:

| Change Type | Files to Update |
|-------------|-----------------|
| New tRPC procedure | Module CLAUDE.md |
| New database table | `apps/api/src/db/CLAUDE.md` |
| New Zod schema | `packages/shared/src/schemas/CLAUDE.md` |
| New WebSocket event | Module CLAUDE.md |
| New component pattern | `apps/web/src/components/CLAUDE.md` |
| New constants | `packages/shared/src/constants/CLAUDE.md` |
| Module structure change | Multiple files + root CLAUDE.md |

## Adding to CI/CD

To run audits in CI, add to your workflow:

```yaml
# .github/workflows/docs-audit.yml
name: Documentation Audit

on:
  pull_request:
    paths:
      - 'apps/**/*.ts'
      - 'packages/**/*.ts'

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install
      - run: ./scripts/maintenance/run-audit.sh
```

## Extending the Scripts

### Adding a New Module

1. Edit `check-claude-docs.sh`:
   ```bash
   MODULE_DOCS+=(
       ["apps/api/src/modules/newmodule"]="apps/api/src/modules/newmodule/CLAUDE.md"
   )
   ```

2. Edit `audit-trpc-docs.ts`:
   ```typescript
   MODULES.push({
     name: 'newmodule',
     codeDir: 'apps/api/src/modules/newmodule',
     docFile: 'apps/api/src/modules/newmodule/CLAUDE.md',
   });
   ```

### Adding New Significant File Patterns

Edit `check-claude-docs.sh`:
```bash
SIGNIFICANT_PATTERNS+=(
    "newpattern.ts"
)
```
