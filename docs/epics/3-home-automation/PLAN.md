# Epic 3: Home Automation

> Your smart home, your interface.

## Overview

The Home Automation module connects HoneyDo to Home Assistant, giving you a unified interface for controlling your smart home alongside your other household tools. This isn't about replacing Home Assistant's powerful UI - it's about putting the most common controls at your fingertips in the app you're already using.

**When this epic is complete**, you'll have:
- Real-time device status from Home Assistant
- Quick toggle controls for lights, switches, and common devices
- Custom scenes (movie mode, bedtime, etc.)
- Dashboard widgets for at-a-glance status
- AI-powered natural language commands ("turn off all the lights")

---

## User Stories

### Core
- **As a user**, I want to see which lights are on without opening another app
- **As a user**, I want to toggle a light with one tap
- **As a user**, I want to create a "movie mode" that dims lights and turns on the TV
- **As a user**, I want to see the temperature inside my house

### AI Enhancement
- **As a user**, I want to say "turn off the garage lights" and have it happen
- **As a user**, I want to ask "is the front door locked?" and get an answer
- **As a user**, I want AI to suggest automations based on my patterns

---

## Goals

1. **Complementary, Not Replacement** - Home Assistant is powerful; HoneyDo is convenient
2. **Quick Actions** - Most common tasks in 1-2 taps
3. **Contextual** - Show what's relevant (kitchen lights in the morning, bedroom at night)
4. **Safe** - Don't allow destructive actions without confirmation

---

## Non-Goals (for this epic)

- Full Home Assistant configuration
- Complex automation creation (use HA for that)
- Direct device integrations (everything goes through HA)
- Security system arming/disarming (too sensitive)
- Camera feeds (bandwidth/complexity)

---

## Architecture

### Integration Approach

HoneyDo connects to Home Assistant via its WebSocket API, not the REST API. This provides:
- Real-time state updates
- Persistent connection
- Full entity access

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   HoneyDo   │◄───────►│   HoneyDo   │◄───────►│    Home     │
│   Frontend  │   WS    │   Backend   │   WS    │  Assistant  │
└─────────────┘         └─────────────┘         └─────────────┘
                              │
                              ▼
                        ┌──────────┐
                        │  SQLite  │ (cached states, scenes, favorites)
                        └──────────┘
```

### Home Assistant Connection

```typescript
// services/homeassistant.ts
class HomeAssistantService {
  private ws: WebSocket;
  private messageId = 0;
  private subscriptions: Map<number, Subscription>;

  async connect(url: string, token: string): Promise<void>;
  async getStates(): Promise<Entity[]>;
  async callService(domain: string, service: string, data?: object): Promise<void>;
  subscribeToStateChanges(callback: (event: StateChangedEvent) => void): () => void;
}
```

---

## Data Model

### Tables

```sql
-- Home Assistant Connection Config
CREATE TABLE ha_config (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Only one row
  url TEXT NOT NULL,                      -- ws://homeassistant.local:8123/api/websocket
  access_token TEXT NOT NULL,             -- Long-lived access token
  connected_at DATETIME,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cached Entity States (for quick loading)
CREATE TABLE ha_entities (
  entity_id TEXT PRIMARY KEY,             -- light.living_room
  domain TEXT NOT NULL,                   -- light
  friendly_name TEXT,
  state TEXT,                             -- on, off, 72, etc.
  attributes JSON,                        -- brightness, color, etc.
  last_changed DATETIME,
  last_updated DATETIME
);

-- User Favorites (quick access)
CREATE TABLE ha_favorites (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  entity_id TEXT NOT NULL,
  display_name TEXT,                      -- Custom name override
  icon TEXT,                              -- Custom icon override
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Custom Scenes (HoneyDo-specific, not HA scenes)
CREATE TABLE ha_scenes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  description TEXT,
  actions JSON NOT NULL,                  -- Array of service calls
  created_by TEXT REFERENCES users(id),
  is_shared BOOLEAN DEFAULT true,         -- Visible to all users?
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Action Log (for debugging and "what happened")
CREATE TABLE ha_action_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  action_type TEXT NOT NULL,              -- 'service_call' | 'scene_activate'
  details JSON NOT NULL,
  status TEXT,                            -- 'success' | 'error'
  error_message TEXT,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Supported Domains

Initial support for:

| Domain | Actions | Display |
|--------|---------|---------|
| `light` | on, off, toggle, brightness, color | Icon + state + brightness slider |
| `switch` | on, off, toggle | Icon + toggle |
| `fan` | on, off, speed | Icon + speed control |
| `climate` | set_temperature, set_hvac_mode | Current temp + target + mode |
| `lock` | lock, unlock | Icon + state (with confirmation) |
| `cover` | open, close, stop | Icon + position |
| `sensor` | (read only) | Value + unit |
| `binary_sensor` | (read only) | Icon + state |

---

## API Design (tRPC)

```typescript
export const homeRouter = router({
  // Configuration
  config: router({
    get: protectedProcedure.query(...),           // Get connection status
    set: adminProcedure.input(configSchema).mutation(...), // Set HA URL/token
    test: adminProcedure.mutation(...),           // Test connection
    disconnect: adminProcedure.mutation(...),
  }),

  // Entities
  entities: router({
    getAll: protectedProcedure.query(...),        // All entities (cached)
    getByDomain: protectedProcedure.input(z.string()).query(...),
    getById: protectedProcedure.input(z.string()).query(...),
    refresh: protectedProcedure.mutation(...),    // Force refresh from HA
  }),

  // Actions
  actions: router({
    callService: protectedProcedure.input(serviceCallSchema).mutation(...),
    toggle: protectedProcedure.input(z.string()).mutation(...), // Quick toggle
  }),

  // Favorites
  favorites: router({
    get: protectedProcedure.query(...),
    add: protectedProcedure.input(addFavoriteSchema).mutation(...),
    remove: protectedProcedure.input(z.string()).mutation(...),
    reorder: protectedProcedure.input(reorderSchema).mutation(...),
  }),

  // Scenes
  scenes: router({
    getAll: protectedProcedure.query(...),
    create: protectedProcedure.input(createSceneSchema).mutation(...),
    update: protectedProcedure.input(updateSceneSchema).mutation(...),
    delete: protectedProcedure.input(z.string()).mutation(...),
    activate: protectedProcedure.input(z.string()).mutation(...),
  }),

  // AI
  ai: router({
    command: protectedProcedure.input(z.string()).mutation(...), // Natural language
    suggestScene: protectedProcedure.query(...),   // Suggest based on patterns
  }),
});
```

---

## WebSocket Events

```typescript
// Server -> Client
'home:entity:state-changed'   // { entityId, oldState, newState }
'home:connection:status'      // { connected, error? }
'home:scene:activated'        // { sceneId, activatedBy }
'home:action:executed'        // { action, status, error? }
```

---

## UI Design

### Screens

1. **Dashboard** (Main Screen)
   - Favorites grid at top (quick toggles)
   - Scenes section (tap to activate)
   - Room-based sections (if entities have area assignments)
   - AI command bar

2. **All Devices**
   - Grouped by domain or area
   - Search/filter
   - Long-press to add to favorites

3. **Scene Editor** (Bottom Sheet)
   - Name, icon selection
   - Add actions (select entity + action)
   - Test scene
   - Save

4. **Settings**
   - Home Assistant URL
   - Connection status
   - Re-authenticate
   - Action history

### Component Hierarchy

```
HomeAutomationPage
├── AICommandBar
│   └── TextInput (with voice button)
├── FavoritesGrid
│   └── EntityCard (quick toggle)
├── ScenesSection
│   └── SceneCard (tap to activate)
└── DevicesByArea
    └── AreaSection
        └── EntityRow

EntityCard
├── Icon (domain-specific, state-colored)
├── Name
├── State (on/off, temperature, etc.)
└── QuickControl (toggle, slider, etc.)
```

### Mobile Interactions

| Action | Gesture |
|--------|---------|
| Toggle device | Tap card |
| Adjust brightness | Slide on card |
| View details | Long press |
| Add to favorites | Long press → "Add to favorites" |
| Activate scene | Tap scene card |
| AI command | Type or voice in command bar |

---

## AI Features

### Natural Language Commands

**Input**: "turn off all the lights downstairs"

**Prompt to Claude**:
```
You are a home automation assistant. The user wants to control their smart home.

Available entities:
{JSON list of entities with entity_id, friendly_name, domain, state}

User command: "{input}"

Determine what service calls to make. Return JSON:
{
  "understood": boolean,
  "actions": [
    {
      "entity_id": string,
      "domain": string,
      "service": string,
      "data"?: object
    }
  ],
  "confirmation_required": boolean,
  "message": string  // What to tell the user
}

If the command is ambiguous or potentially destructive, set confirmation_required to true.
```

### Status Queries

**Input**: "is the garage door closed?"

**Response**: Parse entities, find garage door, return conversational answer.

### Scene Suggestions

Analyze action history to suggest scenes:
- "You often turn on these 3 lights together at 7pm. Want to create a scene?"
- "You dim the living room lights when you start the TV. Make this automatic?"

---

## Security Considerations

### Sensitive Actions

Actions requiring confirmation:
- `lock.unlock` - Always confirm
- `cover.open` (garage doors) - Always confirm
- `alarm_control_panel.*` - Out of scope for now

### Access Control

- Only authenticated users can control devices
- Action logging for accountability
- Consider: per-user device permissions (future)

### Token Security

- HA long-lived access token stored encrypted in database
- Token never sent to frontend
- All HA communication happens server-side

---

## Features Breakdown

### Feature 1: Home Assistant Connection
- Configuration page (admin only)
- Enter HA URL and long-lived access token
- Test connection
- Handle reconnection on failure
- Connection status indicator

### Feature 2: Entity Discovery & Caching
- Fetch all entities on connection
- Cache states in SQLite
- Real-time updates via HA WebSocket
- Refresh on demand

### Feature 3: Quick Controls
- Toggle lights/switches
- Brightness slider for dimmable lights
- Temperature control for climate
- State display for sensors

### Feature 4: Favorites
- Add entities to favorites
- Reorder favorites
- Custom display names
- Quick access grid on dashboard

### Feature 5: Custom Scenes
- Create scenes with multiple actions
- Icon and name customization
- One-tap activation
- Share with household or keep personal

### Feature 6: AI Commands
- Natural language input
- Entity matching
- Service call generation
- Status queries
- Confirmation for sensitive actions

---

## Definition of Done

This epic is complete when:

- [ ] Can connect to Home Assistant via WebSocket
- [ ] Entity states update in real-time
- [ ] Can toggle lights and switches
- [ ] Can create and activate custom scenes
- [ ] Favorites grid works on dashboard
- [ ] AI understands "turn off the lights"
- [ ] Actions are logged for debugging
- [ ] Sensitive actions require confirmation
- [ ] Module follows established patterns

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| HA connection instability | High | Robust reconnection, clear error states |
| WebSocket complexity | Medium | Use established HA client library if available |
| Latency in controls | Medium | Optimistic updates, show pending state |
| AI misunderstands command | Medium | Always confirm before executing |
| Token exposure | High | Server-side only, encrypted storage |

---

## Dependencies

- Epic 1 (Foundation) complete
- Home Assistant instance accessible from HoneyDo server
- Long-lived access token from HA
- Anthropic API key (for AI features)

---

## Features Index

```
docs/epics/3-home-automation/features/
├── 1-connection-setup/PLAN.md
├── 2-entity-management/PLAN.md
├── 3-quick-controls/PLAN.md
├── 4-favorites/PLAN.md
├── 5-custom-scenes/PLAN.md
└── 6-ai-commands/PLAN.md
```

---

*This module makes HoneyDo feel like a true smart home hub.*
