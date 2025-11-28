# Epic 2: Shopping List

> The first module. Prove the architecture works.

## Overview

The Shopping List module is HoneyDo's first real feature. It's deliberately chosen as the first module because:
1. It's immediately useful
2. It exercises all the core systems (CRUD, real-time sync, external integrations, AI)
3. It's simple enough to complete quickly, complex enough to validate the architecture

**When this epic is complete**, you'll have:
- A fully functional shared shopping list
- Real-time sync between users
- Categories and smart sorting
- Google Keep two-way sync
- AI-powered item expansion and suggestions

---

## User Stories

### Core
- **As a user**, I want to add items to a shopping list so I don't forget what to buy
- **As a user**, I want to check off items while shopping so I know what I've gotten
- **As a user**, I want to see items my spouse added in real-time so we stay in sync
- **As a user**, I want to organize items by category so shopping is faster

### Google Keep Sync
- **As a user**, I want my list to sync with Google Keep so I can use either app
- **As a user**, I want changes in Keep to appear in HoneyDo automatically

### AI Enhancement
- **As a user**, I want to add "taco stuff" and have it expand to specific ingredients
- **As a user**, I want suggestions for items I might be forgetting
- **As a user**, I want items automatically categorized

---

## Goals

1. **Fast to Use** - Adding an item should be nearly instant
2. **Always in Sync** - Both users see the same list, always
3. **Smart When Helpful** - AI enhances, doesn't obstruct
4. **Resilient** - Works offline, syncs when back online

---

## Non-Goals (for this epic)

- Multiple lists (future enhancement)
- Sharing lists with external users
- Price tracking
- Recipe integration (Epic 4)
- Voice input (future polish)

---

## Data Model

### Tables

```sql
-- Shopping Lists (support for multiple lists in the future)
CREATE TABLE shopping_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Shopping List',
  created_by TEXT REFERENCES users(id),
  is_default BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  google_keep_id TEXT,             -- For sync mapping
  google_keep_sync_enabled BOOLEAN DEFAULT false,
  last_synced_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Shopping Items
CREATE TABLE shopping_items (
  id TEXT PRIMARY KEY,
  list_id TEXT REFERENCES shopping_lists(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT,                   -- "2", "1 lb", "a bunch", etc.
  unit TEXT,                       -- "pieces", "lbs", "oz", etc.
  category TEXT,                   -- "produce", "dairy", "meat", etc.
  note TEXT,                       -- Additional details
  checked BOOLEAN DEFAULT false,
  checked_at DATETIME,
  checked_by TEXT REFERENCES users(id),
  added_by TEXT REFERENCES users(id),
  sort_order INTEGER DEFAULT 0,
  google_keep_item_id TEXT,        -- For sync mapping
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sync Log (for debugging and conflict resolution)
CREATE TABLE shopping_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id TEXT REFERENCES shopping_lists(id),
  direction TEXT NOT NULL,         -- 'push' | 'pull'
  status TEXT NOT NULL,            -- 'success' | 'error' | 'conflict'
  items_synced INTEGER,
  error_message TEXT,
  details JSON,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Frequently Used Items (for suggestions)
CREATE TABLE shopping_frequent_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  item_name TEXT NOT NULL,
  category TEXT,
  use_count INTEGER DEFAULT 1,
  last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, item_name)
);
```

### Categories

Pre-defined categories for consistent sorting:

```typescript
const CATEGORIES = [
  'produce',
  'dairy',
  'meat',
  'bakery',
  'frozen',
  'pantry',
  'beverages',
  'snacks',
  'household',
  'personal-care',
  'pharmacy',
  'other',
] as const;
```

---

## API Design (tRPC)

### Router Structure

```typescript
// shopping.router.ts
export const shoppingRouter = router({
  // Lists
  lists: router({
    getAll: publicProcedure.query(...),
    getById: publicProcedure.input(z.string()).query(...),
    create: protectedProcedure.input(createListSchema).mutation(...),
    update: protectedProcedure.input(updateListSchema).mutation(...),
    archive: protectedProcedure.input(z.string()).mutation(...),
  }),

  // Items
  items: router({
    getByList: publicProcedure.input(z.string()).query(...),
    add: protectedProcedure.input(addItemSchema).mutation(...),
    addBulk: protectedProcedure.input(addBulkSchema).mutation(...),
    update: protectedProcedure.input(updateItemSchema).mutation(...),
    check: protectedProcedure.input(checkItemSchema).mutation(...),
    uncheck: protectedProcedure.input(z.string()).mutation(...),
    remove: protectedProcedure.input(z.string()).mutation(...),
    reorder: protectedProcedure.input(reorderSchema).mutation(...),
    clearChecked: protectedProcedure.input(z.string()).mutation(...),
  }),

  // Sync
  sync: router({
    triggerKeepSync: protectedProcedure.input(z.string()).mutation(...),
    getSyncStatus: protectedProcedure.input(z.string()).query(...),
  }),

  // AI
  ai: router({
    expandItem: protectedProcedure.input(expandItemSchema).mutation(...),
    suggestItems: protectedProcedure.input(z.string()).query(...),
    categorize: protectedProcedure.input(categorizeSchema).mutation(...),
  }),
});
```

---

## WebSocket Events

### Events Emitted

```typescript
// Server -> Client
'shopping:item:added'      // { listId, item }
'shopping:item:updated'    // { listId, item }
'shopping:item:checked'    // { listId, itemId, checkedBy }
'shopping:item:unchecked'  // { listId, itemId }
'shopping:item:removed'    // { listId, itemId }
'shopping:items:reordered' // { listId, items: { id, sort_order }[] }
'shopping:items:cleared'   // { listId, clearedCount }
'shopping:sync:started'    // { listId }
'shopping:sync:completed'  // { listId, result }
'shopping:sync:error'      // { listId, error }
```

### Event Flow Example

```
User A adds "Milk"
    │
    ▼
API creates item in DB
    │
    ├──► Returns item to User A
    │
    └──► WebSocket broadcasts 'shopping:item:added' to User B
              │
              ▼
         User B's UI updates instantly
```

---

## UI Design

### Screens

1. **List View** (Main Screen)
   - Quick-add input at top (always visible)
   - Items grouped by category (collapsible)
   - Unchecked items first, checked items dimmed below
   - Swipe left to delete, tap to check
   - Pull to refresh / sync indicator

2. **Item Detail** (Bottom Sheet)
   - Edit name, quantity, note
   - Change category
   - Delete button
   - "Who added" / "When" metadata

3. **AI Expand** (Bottom Sheet)
   - Shows when AI detects expandable input
   - "Did you mean?" with expanded items
   - Accept all / Select individual / Cancel

4. **Sync Settings** (In Settings Page)
   - Google Keep connection status
   - Manual sync trigger
   - Sync history / errors

### Component Hierarchy

```
ShoppingListPage
├── QuickAddBar
│   ├── TextInput
│   ├── AIExpandButton (appears when relevant)
│   └── AddButton
├── CategorySections
│   └── CategorySection (one per category with items)
│       ├── CategoryHeader (collapsible)
│       └── ItemList
│           └── ShoppingItem (swipeable)
│               ├── Checkbox
│               ├── ItemName
│               ├── Quantity
│               └── SwipeActions
├── CheckedSection (collapsible, dimmed)
│   └── ItemList
└── SyncStatusBar (shows sync state)
```

### Mobile-First Interactions

| Action | Gesture |
|--------|---------|
| Add item | Type + Enter or tap Add |
| Check item | Tap anywhere on item |
| Edit item | Long press or tap edit icon |
| Delete item | Swipe left |
| Reorder | Drag handle (when in edit mode) |
| Expand with AI | Tap sparkle icon after typing |
| Refresh | Pull down |

---

## Google Keep Sync

### Integration Approach

Using unofficial Google Keep API (`gkeepapi` or similar Node implementation).

**Challenges**:
- No official API, may break
- Rate limits unknown
- Auth requires Google credentials

**Strategy**:
- HoneyDo is source of truth
- Sync on manual trigger + periodic (every 5 min when app is open)
- Conflict resolution: most recent wins, with merge for different items
- If sync fails, queue and retry

### Sync Flow

```
┌─────────────┐                    ┌─────────────┐
│   HoneyDo   │                    │ Google Keep │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  1. Fetch Keep list state        │
       │─────────────────────────────────►│
       │◄─────────────────────────────────│
       │                                  │
       │  2. Compare with local state     │
       │  3. Merge changes:               │
       │     - New in Keep → add local    │
       │     - New in HoneyDo → add Keep  │
       │     - Modified → latest wins     │
       │     - Checked → sync check state │
       │                                  │
       │  4. Push changes to Keep         │
       │─────────────────────────────────►│
       │                                  │
       │  5. Update local sync metadata   │
       │                                  │
```

### Conflict Resolution

| Scenario | Resolution |
|----------|------------|
| Item added in both | Keep both (different IDs) |
| Same item modified in both | Most recent timestamp wins |
| Item deleted in one, modified in other | Keep the modified version |
| Item checked in one, unchecked in other | Checked wins (safer) |

---

## AI Features

### Item Expansion

**Input**: "taco stuff"

**Prompt to Claude**:
```
You are a helpful shopping assistant. The user wants to add "{input}" to their shopping list.

If this is a vague or composite item (like "taco stuff", "breakfast items", "salad ingredients"), expand it into specific items they likely need.

If this is already a specific item, return it as-is.

Return JSON: { "isExpanded": boolean, "items": [{ "name": string, "category": string, "quantity"?: string }] }
```

**Output**:
```json
{
  "isExpanded": true,
  "items": [
    { "name": "Ground beef", "category": "meat", "quantity": "1 lb" },
    { "name": "Taco shells", "category": "pantry" },
    { "name": "Shredded cheese", "category": "dairy" },
    { "name": "Lettuce", "category": "produce" },
    { "name": "Tomatoes", "category": "produce" },
    { "name": "Sour cream", "category": "dairy" },
    { "name": "Taco seasoning", "category": "pantry" }
  ]
}
```

### Suggestions

Based on:
- Frequently purchased items not on current list
- Items commonly bought together (if user adds "pasta", suggest "pasta sauce")
- Time-based patterns (if user buys milk weekly, suggest when it's been a week)

### Auto-Categorization

When an item is added without a category, ask Claude to categorize it.

**Prompt**:
```
Categorize this shopping item into one of these categories:
produce, dairy, meat, bakery, frozen, pantry, beverages, snacks, household, personal-care, pharmacy, other

Item: "{itemName}"

Return only the category name, nothing else.
```

---

## Features Breakdown

### Feature 1: List CRUD
- Create default list on first login
- Display list view
- Support for multiple lists (data model ready, UI is single list for now)
- Archive/restore lists

### Feature 2: Item Management
- Add items (single)
- Add items (bulk paste)
- Edit items
- Delete items
- Quantity/unit support
- Notes on items

### Feature 3: Check/Uncheck Flow
- Tap to check
- Track who checked and when
- Checked items move to bottom
- Clear all checked items
- Undo check (within session)

### Feature 4: Real-time Sync
- WebSocket events for all changes
- Optimistic updates on client
- Sync indicator in UI
- Handle offline queue

### Feature 5: Categories & Sorting
- Auto-categorize new items (AI)
- Manual category override
- Sort by category in store order
- Custom sort order within category
- Drag to reorder

### Feature 6: Google Keep Sync
- Connect Google account (separate from Clerk auth)
- Select which Keep list to sync
- Manual sync trigger
- Auto-sync on interval
- Sync status and error display
- Disconnect/reconnect

### Feature 7: AI Features
- Expand vague items
- Suggest missing items
- Auto-categorize
- Smart quantity parsing ("2 lbs ground beef" → name: "Ground beef", quantity: "2", unit: "lbs")

---

## Definition of Done

This epic is complete when:

- [ ] User can add/edit/delete items on a shopping list
- [ ] Checking items works with real-time sync to other users
- [ ] Items are organized by category
- [ ] Google Keep sync works bidirectionally
- [ ] AI can expand "taco stuff" into specific ingredients
- [ ] Items are auto-categorized by AI
- [ ] Offline adds are queued and sync when online
- [ ] UI is fast and responsive on mobile
- [ ] Module follows established patterns from Epic 1

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Google Keep API breaks | High | Design sync as optional, app works without it |
| AI hallucinations in expansion | Medium | Always show user what AI suggests, require confirmation |
| Sync conflicts | Medium | Clear conflict resolution rules, most recent wins |
| Performance with large lists | Low | Virtual scrolling if needed, pagination |

---

## Dependencies

- Epic 1 (Foundation) must be complete
- Google account with Keep enabled
- Anthropic API key configured

---

## Features Index

```
docs/epics/2-shopping-list/features/
├── 1-list-crud/PLAN.md
├── 2-item-management/PLAN.md
├── 3-check-uncheck/PLAN.md
├── 4-realtime-sync/PLAN.md
├── 5-categories-sorting/PLAN.md
├── 6-google-keep-sync/PLAN.md
└── 7-ai-features/PLAN.md
```

---

*This is the first module - get it right, and the rest follow the pattern.*
