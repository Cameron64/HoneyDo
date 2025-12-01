# HoneyDo Documentation - Claude Code Instructions

> Documentation structure and standards for the HoneyDo project

## Documentation Philosophy

**Documentation is the spec.** Before implementing any feature:
1. Check if a plan exists
2. Follow the plan's technical details
3. Update the plan if implementation differs significantly

## Directory Structure

```
docs/
├── CLAUDE.md              # This file
├── PLAN.md                # Master project plan (architecture, roadmap)
└── epics/
    ├── 1-foundation/
    │   ├── PLAN.md        # Epic overview
    │   └── features/
    │       ├── 1-project-setup/PLAN.md
    │       ├── 2-authentication/PLAN.md
    │       └── ...
    ├── 2-shopping-list/
    │   ├── PLAN.md
    │   └── features/
    │       ├── 1-list-crud/PLAN.md
    │       ├── 2-item-management/PLAN.md
    │       └── ...
    ├── 3-home-automation/
    │   ├── PLAN.md
    │   └── features/
    │       ├── 1-connection-setup/PLAN.md
    │       ├── 2-entity-management/PLAN.md
    │       ├── 3-quick-controls/PLAN.md
    │       ├── 4-favorites/PLAN.md
    │       ├── 5-custom-scenes/PLAN.md
    │       └── 6-ai-commands/PLAN.md
    └── 4-recipes/
        ├── PLAN.md
        └── features/
            └── ...
```

## Document Types

### Master Plan (`docs/PLAN.md`)

The single source of truth for:
- Project vision and philosophy
- Tech stack decisions with rationale
- System architecture diagrams
- Module system design
- Data model overview
- Security considerations
- Development roadmap
- Success metrics

**When to update:** Architecture changes, new modules, tech stack changes

### Epic Plan (`docs/epics/<n>-<name>/PLAN.md`)

Overview of a major feature area:
- Epic vision and goals
- Feature list with brief descriptions
- Dependencies on other epics
- Overall timeline considerations
- Success criteria for the epic

**When to update:** Adding/removing features from epic, changing epic scope

### Feature Plan (`docs/epics/<n>-<name>/features/<n>-<feature>/PLAN.md`)

Detailed implementation spec for a single feature:
- Feature overview
- User stories / acceptance criteria
- Technical details
- Data models (Drizzle schema)
- API design (tRPC procedures)
- Frontend components
- WebSocket events
- Code examples
- Edge cases and error handling
- Testing considerations

**When to update:** Before implementing, after significant implementation changes

## Feature Plan Template

```markdown
# Feature: <Feature Name>

## Overview

Brief description of what this feature does and why it exists.

## User Stories

- As a user, I want to...
- As an admin, I want to...

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Technical Details

### Data Model

```typescript
// Drizzle schema
export const tableName = sqliteTable('table_name', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  // ...fields
});
```

### API (tRPC)

```typescript
// Router procedures
router({
  getAll: protectedProcedure.query(...),
  create: protectedProcedure.input(schema).mutation(...),
});
```

### Frontend Components

| Component | Purpose |
|-----------|---------|
| `ComponentName` | What it does |

### WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `module:entity:action` | Server→Client | `{ ... }` |

## Implementation Notes

Any special considerations, gotchas, or decisions.

## Edge Cases

- What happens when X?
- How to handle Y?

## Testing

- Unit tests for...
- Integration tests for...
- E2E scenarios...
```

## Epic Status Tracking

Use these markers in epic PLAN.md files:

```markdown
## Features

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Project Setup | ✅ Done | |
| 2 | Authentication | ✅ Done | |
| 3 | Database | ✅ Done | |
| 4 | API Foundation | ✅ Done | |
| 5 | Frontend Shell | 🚧 In Progress | Missing settings page |
| 6 | WebSocket | ⏳ Planned | |
| 7 | Settings | ⏳ Planned | |
| 8 | PWA | ⏳ Planned | |

Status: ✅ Done | 🚧 In Progress | ⏳ Planned | ❌ Blocked
```

### Current Epic Status Overview

| Epic | Status | Features |
|------|--------|----------|
| **Epic 1: Foundation** | ✅ Done | 8 features |
| **Epic 2: Shopping List** | ✅ Done | 6 features |
| **Epic 3: Home Automation** | ✅ Done | 6 features |
| **Epic 4: Recipes** | ✅ Done | Features complete (scheduler pending) |

## Code Examples in Docs

Always provide runnable code examples that match actual project patterns:

```typescript
// Good - matches actual codebase patterns
import { router, protectedProcedure } from '../../trpc';
import { createListSchema } from '@honeydo/shared/schemas';

export const shoppingListRouter = router({
  create: protectedProcedure
    .input(createListSchema)
    .mutation(async ({ ctx, input }) => {
      const [list] = await ctx.db.insert(shoppingLists)
        .values({ name: input.name, createdBy: ctx.userId })
        .returning();
      return list;
    }),
});
```

```typescript
// Bad - generic/incorrect patterns
const router = express.Router();
router.post('/lists', async (req, res) => {
  // Wrong framework, wrong patterns
});
```

## Mermaid Diagrams

Use Mermaid for diagrams (GitHub renders them):

```markdown
​```mermaid
graph TD
    A[User] --> B[Web App]
    B --> C[API Server]
    C --> D[Database]
    C --> E[Home Assistant]
​```
```

## Cross-References

Link between related documents:

```markdown
See [Shopping List CRUD](../2-shopping-list/features/1-list-crud/PLAN.md) for details.

Related: [Authentication](../1-foundation/features/2-authentication/PLAN.md)
```

## Updating Documentation

### Before Implementation

1. Read the feature plan thoroughly
2. Note any unclear areas
3. Ask questions or update plan before coding

### During Implementation

1. Keep notes on deviations from plan
2. Document any decisions made
3. Update code examples if patterns change

### After Implementation

1. Update feature plan with actual implementation
2. Mark acceptance criteria as complete
3. Add any new edge cases discovered
4. Update epic status

## Finding Documentation

| Looking For | Location |
|-------------|----------|
| Project architecture | `docs/PLAN.md` |
| Module overview | `docs/epics/<epic>/PLAN.md` |
| Feature spec | `docs/epics/<epic>/features/<feature>/PLAN.md` |
| API patterns | `apps/api/CLAUDE.md` |
| Frontend patterns | `apps/web/CLAUDE.md` |
| Types/schemas | `packages/shared/CLAUDE.md` |
| Database patterns | `apps/api/src/db/CLAUDE.md` |
| Shopping List (Epic 2) | `apps/api/src/modules/shopping/CLAUDE.md`, `apps/web/src/modules/shopping/CLAUDE.md` |
| Home Automation (Epic 3) | `apps/api/src/modules/home/CLAUDE.md`, `apps/web/src/modules/home/CLAUDE.md` |

## Documentation Checklist

Before considering a feature complete:

- [ ] Feature plan exists and is up to date
- [ ] Code examples in plan match implementation
- [ ] All acceptance criteria are checked off
- [ ] Epic status is updated
- [ ] Any new patterns are documented
- [ ] Cross-references are added where helpful

## Writing Style

- Use present tense ("The API returns..." not "The API will return...")
- Be specific and concrete
- Include code examples for complex concepts
- Use tables for structured information
- Keep paragraphs short
- Use bullet points for lists
- Avoid jargon without explanation
