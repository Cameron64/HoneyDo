# CLAUDE.md Files Maintenance Plan

## Overview

This document outlines a systematic strategy for maintaining and updating all 18 CLAUDE.md files across the HoneyDo repository. These files serve as context for Claude Code to understand the codebase structure, patterns, and conventions.

---

## Current Inventory

### Summary Statistics
- **Total CLAUDE.md files**: 18
- **Total documentation lines**: ~6,867
- **Last comprehensive update**: November 28, 2025 (initial commit)

### File List by Layer

| # | Path | Lines | Purpose |
|---|------|-------|---------|
| **Root** |
| 1 | `CLAUDE.md` | 483 | Master project instructions |
| **Backend (apps/api)** |
| 2 | `apps/api/CLAUDE.md` | 464 | Fastify, tRPC patterns |
| 3 | `apps/api/src/db/CLAUDE.md` | 536 | Drizzle ORM patterns |
| 4 | `apps/api/src/modules/CLAUDE.md` | 492 | Module creation guide |
| 5 | `apps/api/src/modules/shopping/CLAUDE.md` | 340 | Shopping API (Epic 2) |
| 6 | `apps/api/src/modules/home/CLAUDE.md` | 220 | Home Automation API (Epic 3) |
| 7 | `apps/api/src/modules/recipes/CLAUDE.md` | 278 | Recipes API (Epic 4) |
| **Frontend (apps/web)** |
| 8 | `apps/web/CLAUDE.md` | 626 | React, routing, state |
| 9 | `apps/web/src/components/CLAUDE.md` | 512 | UI component patterns |
| 10 | `apps/web/src/modules/CLAUDE.md` | 269 | Module organization |
| 11 | `apps/web/src/modules/shopping/CLAUDE.md` | 473 | Shopping UI (Epic 2) |
| 12 | `apps/web/src/modules/home/CLAUDE.md` | 191 | Home Automation UI (Epic 3) |
| 13 | `apps/web/src/modules/recipes/CLAUDE.md` | 259 | Recipes UI (Epic 4) |
| **Shared (packages/shared)** |
| 14 | `packages/shared/CLAUDE.md` | 429 | Types, schemas overview |
| 15 | `packages/shared/src/schemas/CLAUDE.md` | 365 | Zod schema patterns |
| 16 | `packages/shared/src/constants/CLAUDE.md` | 272 | Constants reference |
| **Infrastructure** |
| 17 | `docker/CLAUDE.md` | 362 | Docker configuration |
| 18 | `docs/CLAUDE.md` | 296 | Documentation standards |

---

## Update Strategy

### Phase 1: Audit & Gap Analysis (Priority: HIGH)

**Goal**: Identify discrepancies between documentation and implementation

#### 1.1 Epic Status Reconciliation
The root `CLAUDE.md` claims:
- Epic 1: Done
- Epic 2: Done
- Epic 3: In Progress
- Epic 4: Planned

**Reality** (from code analysis):
- Epic 1: Done (100%)
- Epic 2: Done (100%)
- Epic 3: ~75% implemented (DB 100%, API 80%, UI 70%)
- Epic 4: ~85% implemented (DB 100%, API 85%, UI 90%)

**Action**: Update epic status table in root `CLAUDE.md` to reflect actual progress.

#### 1.2 Missing Documentation Sections
Identify features that exist in code but lack documentation:
- [ ] Claude Code skill integration (recipes AI)
- [ ] Home Assistant service layer patterns
- [ ] Recipe history JSON structure
- [ ] Google Keep sync schema (prepared but not implemented)

#### 1.3 Outdated Code Examples
Review all code snippets in CLAUDE.md files against actual implementations:
- [ ] tRPC router examples vs actual router code
- [ ] Database schema examples vs actual schema files
- [ ] Component patterns vs actual component implementations

### Phase 2: Systematic File Updates (Priority: HIGH)

**Update Order**: Bottom-up (specific → general)

#### Wave 1: Module-Specific Files (Week 1-2)
Update in pairs (backend + frontend for each module):

1. **Shopping Module** (Epic 2 - Complete)
   - `apps/api/src/modules/shopping/CLAUDE.md`
   - `apps/web/src/modules/shopping/CLAUDE.md`
   - Focus: Verify accuracy, add any missing patterns

2. **Home Automation Module** (Epic 3 - In Progress)
   - `apps/api/src/modules/home/CLAUDE.md`
   - `apps/web/src/modules/home/CLAUDE.md`
   - Focus: Document HA service integration, entity patterns

3. **Recipes Module** (Epic 4 - Substantial)
   - `apps/api/src/modules/recipes/CLAUDE.md`
   - `apps/web/src/modules/recipes/CLAUDE.md`
   - Focus: Document Claude skill integration, suggestion flow

#### Wave 2: Layer Files (Week 2-3)
Update shared infrastructure docs:

4. **Database Layer**
   - `apps/api/src/db/CLAUDE.md`
   - Focus: Add relations patterns, JSON column handling

5. **Shared Package**
   - `packages/shared/CLAUDE.md`
   - `packages/shared/src/schemas/CLAUDE.md`
   - `packages/shared/src/constants/CLAUDE.md`
   - Focus: Ensure schema examples match actual code

6. **Component Library**
   - `apps/web/src/components/CLAUDE.md`
   - Focus: Document any new shared components

#### Wave 3: Core Files (Week 3-4)
Update high-level documentation:

7. **App-Level Docs**
   - `apps/api/CLAUDE.md`
   - `apps/web/CLAUDE.md`
   - Focus: Service layer patterns, hook patterns

8. **Module Guides**
   - `apps/api/src/modules/CLAUDE.md`
   - `apps/web/src/modules/CLAUDE.md`
   - Focus: Ensure patterns reflect all three modules

#### Wave 4: Root & Infrastructure (Week 4)
Final rollup to top-level docs:

9. **Infrastructure**
   - `docker/CLAUDE.md`
   - `docs/CLAUDE.md`
   - Focus: Any deployment/container changes

10. **Root CLAUDE.md**
    - `CLAUDE.md`
    - Focus: Epic status, quick reference table, cross-references

### Phase 3: Ongoing Maintenance (Priority: MEDIUM) ✅ IMPLEMENTED

> **Status**: Phase 3 automation implemented on 2025-11-29
> **Location**: `scripts/maintenance/`

#### 3.1 Update Triggers
Update CLAUDE.md files when:
- Adding a new tRPC procedure
- Adding a new database table/column
- Adding a new Zod schema
- Creating a new component pattern
- Adding new WebSocket events
- Changing module structure
- Adding new constants/categories

#### 3.2 Review Schedule
- **Weekly**: Module-specific files (during active development)
- **Monthly**: Layer files (db, shared, components)
- **Quarterly**: Root and infrastructure files

#### 3.3 Automation Tools ✅ IMPLEMENTED

The following automation scripts are now available in `scripts/maintenance/`:

| Script | Purpose | Usage |
|--------|---------|-------|
| `run-audit.sh` | Master script to run all audits | `./scripts/maintenance/run-audit.sh` |
| `check-claude-docs.sh` | Pre-commit hook for doc warnings | Copy to `.git/hooks/pre-commit` |
| `audit-trpc-docs.ts` | Compare tRPC procedures vs docs | `npx ts-node scripts/maintenance/audit-trpc-docs.ts` |
| `audit-drizzle-docs.ts` | Compare Drizzle tables vs docs | `npx ts-node scripts/maintenance/audit-drizzle-docs.ts` |

**Quick Start:**
```bash
# Run all documentation audits
./scripts/maintenance/run-audit.sh

# Install pre-commit hook
cp scripts/maintenance/check-claude-docs.sh .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

See `scripts/maintenance/README.md` for full documentation

---

## Update Checklist Template

Use this checklist when updating any CLAUDE.md file:

```markdown
## CLAUDE.md Update Checklist

### Pre-Update
- [ ] Read the current CLAUDE.md file completely
- [ ] Identify the scope of files this document covers
- [ ] List all actual source files in that scope
- [ ] Note any new patterns or conventions introduced

### Content Review
- [ ] Epic/feature status is accurate
- [ ] File structure matches actual directory layout
- [ ] Code examples compile and match actual code
- [ ] tRPC procedure names are current
- [ ] Database table/column names are current
- [ ] Zod schema names are current
- [ ] Component names are current
- [ ] WebSocket event names are current
- [ ] Cross-references to other CLAUDE.md files are valid

### Post-Update
- [ ] No broken links or references
- [ ] Consistent formatting with other CLAUDE.md files
- [ ] Update "Last Updated" if using version tracking
- [ ] Update root CLAUDE.md if module status changed
```

---

## Specific Updates Needed (Current State)

### Immediate Actions

#### 1. Root CLAUDE.md
```diff
## Epic Status
- | **Epic 3: Home Automation** | 🚧 In Progress |
+ | **Epic 3: Home Automation** | 🚧 75% Complete |
- | **Epic 4: Recipes** | ⏳ Planned |
+ | **Epic 4: Recipes** | 🚧 85% Complete |
```

#### 2. apps/api/src/modules/recipes/CLAUDE.md
Add documentation for:
- Claude Code skill integration pattern
- `suggestions.router.ts` AI flow
- Recipe history JSON structure
- Meal preference export format

#### 3. apps/api/src/modules/home/CLAUDE.md
Add documentation for:
- Home Assistant WebSocket service
- Entity state caching strategy
- Real-time state subscription pattern

#### 4. packages/shared/src/schemas/CLAUDE.md
Add documentation for:
- Recipes schemas (30+ schemas exist)
- Skill input/output schemas
- Complex nested validation patterns

### Documentation Gaps to Fill

| Gap | Location | Priority |
|-----|----------|----------|
| Claude skill integration | recipes/CLAUDE.md | HIGH |
| HA service layer | home/CLAUDE.md | HIGH |
| Recipe history format | recipes/CLAUDE.md | MEDIUM |
| Google Keep sync schema | shopping/CLAUDE.md | LOW (not implemented) |
| WebSocket reconnection | apps/api/CLAUDE.md | MEDIUM |
| Offline queue patterns | shopping/CLAUDE.md | MEDIUM |

---

## File Dependency Graph

Understanding dependencies helps prioritize updates:

```
CLAUDE.md (root)
├── References all other CLAUDE.md files
├── Contains epic status (depends on module files)
└── Contains quick reference (depends on all layer files)

apps/api/CLAUDE.md
├── Depends on: modules/CLAUDE.md, db/CLAUDE.md
└── Referenced by: root CLAUDE.md

apps/api/src/modules/CLAUDE.md
├── Depends on: shopping/, home/, recipes/ CLAUDE.md files
└── Referenced by: apps/api/CLAUDE.md

apps/api/src/modules/{module}/CLAUDE.md
├── Depends on: actual router implementations
└── Referenced by: modules/CLAUDE.md, root CLAUDE.md

packages/shared/CLAUDE.md
├── Depends on: schemas/, constants/, types/ content
└── Referenced by: root CLAUDE.md, api and web CLAUDE.md files
```

**Update Rule**: Always update leaf nodes (module-specific) before updating parent nodes (layer-level, root).

---

## Metrics & Success Criteria

### Quality Metrics
- **Accuracy**: Code examples compile without errors
- **Completeness**: All public APIs documented
- **Currency**: Documentation reflects current implementation
- **Consistency**: Patterns described match actual code

### Success Criteria for Phase 2 Completion
- [ ] All 18 CLAUDE.md files reviewed and updated
- [ ] Epic status reflects actual implementation (>80% accuracy)
- [ ] All tRPC procedures documented in relevant files
- [ ] All database tables documented in db/CLAUDE.md
- [ ] All Zod schemas listed in schemas/CLAUDE.md
- [ ] Cross-references between files validated

---

## Appendix: File Locations (Absolute Paths)

For scripting and automation:

```
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\apps\api\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\apps\api\src\db\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\apps\api\src\modules\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\apps\api\src\modules\shopping\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\apps\api\src\modules\home\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\apps\api\src\modules\recipes\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\apps\web\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\apps\web\src\components\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\apps\web\src\modules\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\apps\web\src\modules\shopping\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\apps\web\src\modules\home\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\apps\web\src\modules\recipes\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\packages\shared\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\packages\shared\src\schemas\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\packages\shared\src\constants\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\docker\CLAUDE.md
C:\Users\Cam Dowdle\source\repos\personal\HoneyDo\docs\CLAUDE.md
```

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-29 | 1.0 | Initial maintenance plan created |
| 2025-11-29 | 1.1 | Phase 3 implemented: automation scripts for documentation audits |
