# Feature 2.6: Google Keep Sync

> Your list, everywhere. Sync with Keep.

## Overview

This feature syncs shopping lists with Google Keep, allowing you to use either app interchangeably. The sync uses the unofficial Google Keep API, which means it may require occasional maintenance but provides a seamless experience when working.

## Acceptance Criteria

- [ ] Can connect Google account for Keep access
- [ ] Can select which Keep list to sync
- [ ] Two-way sync: changes in HoneyDo appear in Keep
- [ ] Two-way sync: changes in Keep appear in HoneyDo
- [ ] Manual sync trigger available
- [ ] Auto-sync on interval (when app is open)
- [ ] Sync status and errors displayed
- [ ] Can disconnect sync

## Technical Details

### Important Caveats

**Google Keep has no official API.** This integration uses community-maintained libraries that reverse-engineer the Keep API. This means:
- May break when Google updates their systems
- Requires Google account credentials (not OAuth)
- Should be treated as "best effort" functionality
- HoneyDo should work perfectly without it

### Library Options

1. **gkeepapi (Python)** - Most mature, but requires Python
2. **keep-clone (Node)** - Node.js port, less maintained
3. **Custom implementation** - Direct API calls

Recommendation: Use a Python microservice for gkeepapi, called from Node backend.

### Architecture

```
┌─────────────┐     HTTP      ┌─────────────┐     gkeepapi    ┌─────────────┐
│   HoneyDo   │──────────────►│   Keep      │───────────────►│   Google    │
│   Backend   │               │   Service   │                 │   Keep      │
└─────────────┘               └─────────────┘                 └─────────────┘
                              (Python/FastAPI)
```

### Keep Service (Python)

```python
# keep-service/main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import gkeepapi

app = FastAPI()

# Cache keep instances per user
keep_instances: dict[str, gkeepapi.Keep] = {}

class Credentials(BaseModel):
    email: str
    master_token: str  # App-specific password or master token

class SyncRequest(BaseModel):
    list_id: str
    items: list[dict]

@app.post("/connect")
async def connect(creds: Credentials):
    """Connect to Google Keep"""
    try:
        keep = gkeepapi.Keep()
        keep.resume(creds.email, creds.master_token)
        keep_instances[creds.email] = keep
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.get("/lists/{email}")
async def get_lists(email: str):
    """Get all Keep lists"""
    keep = keep_instances.get(email)
    if not keep:
        raise HTTPException(status_code=401, detail="Not connected")

    keep.sync()
    lists = keep.find(func=lambda x: x.type.name == 'List')
    return [{"id": l.id, "title": l.title} for l in lists]

@app.get("/list/{email}/{list_id}")
async def get_list(email: str, list_id: str):
    """Get items from a Keep list"""
    keep = keep_instances.get(email)
    if not keep:
        raise HTTPException(status_code=401, detail="Not connected")

    keep.sync()
    glist = keep.get(list_id)
    if not glist:
        raise HTTPException(status_code=404)

    items = []
    for item in glist.items:
        items.append({
            "id": item.id,
            "text": item.text,
            "checked": item.checked,
        })

    return {"id": glist.id, "title": glist.title, "items": items}

@app.post("/sync/{email}/{list_id}")
async def sync_list(email: str, list_id: str, request: SyncRequest):
    """Sync items to Keep list"""
    keep = keep_instances.get(email)
    if not keep:
        raise HTTPException(status_code=401, detail="Not connected")

    keep.sync()
    glist = keep.get(list_id)
    if not glist:
        raise HTTPException(status_code=404)

    # Process incoming items
    for item in request.items:
        existing = None
        for gitem in glist.items:
            if gitem.id == item.get("keep_id"):
                existing = gitem
                break

        if existing:
            # Update existing
            existing.text = item["name"]
            existing.checked = item["checked"]
        else:
            # Add new
            glist.add(item["name"], item["checked"])

    keep.sync()
    return {"success": True}
```

### HoneyDo Backend Integration

```typescript
// apps/api/src/services/google-keep.ts
import axios from 'axios';

const KEEP_SERVICE_URL = process.env.KEEP_SERVICE_URL ?? 'http://localhost:8000';

export class GoogleKeepService {
  private email: string;

  constructor(email: string) {
    this.email = email;
  }

  async connect(masterToken: string): Promise<void> {
    await axios.post(`${KEEP_SERVICE_URL}/connect`, {
      email: this.email,
      master_token: masterToken,
    });
  }

  async getLists(): Promise<{ id: string; title: string }[]> {
    const response = await axios.get(`${KEEP_SERVICE_URL}/lists/${this.email}`);
    return response.data;
  }

  async getList(listId: string): Promise<KeepList> {
    const response = await axios.get(`${KEEP_SERVICE_URL}/list/${this.email}/${listId}`);
    return response.data;
  }

  async syncItems(listId: string, items: SyncItem[]): Promise<void> {
    await axios.post(`${KEEP_SERVICE_URL}/sync/${this.email}/${listId}`, {
      list_id: listId,
      items,
    });
  }
}

interface SyncItem {
  name: string;
  checked: boolean;
  keep_id?: string;
}
```

### Sync Router

```typescript
// apps/api/src/modules/shopping/sync.router.ts
export const syncRouter = router({
  // Get sync status
  getStatus: protectedProcedure
    .input(z.string()) // listId
    .query(async ({ ctx, input }) => {
      const list = await ctx.db.query.shoppingLists.findFirst({
        where: eq(shoppingLists.id, input),
        columns: {
          googleKeepId: true,
          googleKeepSyncEnabled: true,
          lastSyncedAt: true,
        },
      });

      const recentLogs = await ctx.db.query.shoppingSyncLog.findMany({
        where: eq(shoppingSyncLog.listId, input),
        orderBy: desc(shoppingSyncLog.syncedAt),
        limit: 5,
      });

      return {
        connected: !!list?.googleKeepId,
        enabled: list?.googleKeepSyncEnabled ?? false,
        lastSyncedAt: list?.lastSyncedAt,
        recentSyncs: recentLogs,
      };
    }),

  // Connect to Keep
  connectKeep: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      masterToken: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const keep = new GoogleKeepService(input.email);

      try {
        await keep.connect(input.masterToken);

        // Store credentials securely
        await ctx.db.insert(googleKeepCredentials).values({
          userId: ctx.userId,
          email: input.email,
          masterToken: encrypt(input.masterToken),
        }).onConflictDoUpdate({
          target: googleKeepCredentials.userId,
          set: {
            email: input.email,
            masterToken: encrypt(input.masterToken),
          },
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Failed to connect to Google Keep',
        });
      }
    }),

  // Get available Keep lists
  getKeepLists: protectedProcedure.query(async ({ ctx }) => {
    const creds = await ctx.db.query.googleKeepCredentials.findFirst({
      where: eq(googleKeepCredentials.userId, ctx.userId),
    });

    if (!creds) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Not connected' });
    }

    const keep = new GoogleKeepService(creds.email);
    await keep.connect(decrypt(creds.masterToken));

    return keep.getLists();
  }),

  // Link a HoneyDo list to a Keep list
  linkList: protectedProcedure
    .input(z.object({
      listId: z.string(),
      keepListId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(shoppingLists)
        .set({
          googleKeepId: input.keepListId,
          googleKeepSyncEnabled: true,
        })
        .where(eq(shoppingLists.id, input.listId));

      // Trigger initial sync
      await performSync(ctx, input.listId);

      return { success: true };
    }),

  // Manual sync trigger
  triggerSync: protectedProcedure
    .input(z.string()) // listId
    .mutation(async ({ ctx, input }) => {
      socketEmitter.toHousehold('shopping:sync:started', { listId: input });

      try {
        const result = await performSync(ctx, input);
        socketEmitter.toHousehold('shopping:sync:completed', {
          listId: input,
          result,
        });
        return result;
      } catch (error) {
        socketEmitter.toHousehold('shopping:sync:error', {
          listId: input,
          error: error.message,
        });
        throw error;
      }
    }),

  // Disconnect sync
  disconnect: protectedProcedure
    .input(z.string()) // listId
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(shoppingLists)
        .set({
          googleKeepId: null,
          googleKeepSyncEnabled: false,
        })
        .where(eq(shoppingLists.id, input));

      return { success: true };
    }),
});

async function performSync(ctx: Context, listId: string) {
  // Get list and items
  const list = await ctx.db.query.shoppingLists.findFirst({
    where: eq(shoppingLists.id, listId),
    with: { items: true },
  });

  if (!list?.googleKeepId) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED' });
  }

  // Get Keep service
  const creds = await ctx.db.query.googleKeepCredentials.findFirst({
    where: eq(googleKeepCredentials.userId, ctx.userId),
  });
  const keep = new GoogleKeepService(creds!.email);
  await keep.connect(decrypt(creds!.masterToken));

  // Get Keep list state
  const keepList = await keep.getList(list.googleKeepId);

  // Merge logic
  const result = await mergeItems(ctx, list, keepList);

  // Push changes to Keep
  await keep.syncItems(list.googleKeepId, result.toKeep);

  // Update local items
  for (const item of result.toLocal) {
    await ctx.db.insert(shoppingItems).values(item)
      .onConflictDoUpdate({
        target: shoppingItems.id,
        set: item,
      });
  }

  // Log sync
  await ctx.db.insert(shoppingSyncLog).values({
    listId,
    direction: 'both',
    status: 'success',
    itemsSynced: result.toKeep.length + result.toLocal.length,
  });

  // Update last synced
  await ctx.db.update(shoppingLists)
    .set({ lastSyncedAt: new Date().toISOString() })
    .where(eq(shoppingLists.id, listId));

  return {
    itemsSynced: result.toKeep.length + result.toLocal.length,
    addedToKeep: result.toKeep.filter(i => !i.keep_id).length,
    addedToLocal: result.toLocal.filter(i => !i.googleKeepItemId).length,
  };
}
```

### Sync Settings UI

```tsx
// apps/web/src/modules/shopping/components/SyncSettings.tsx
import { trpc } from '../../../lib/trpc';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { RefreshCw, Link, Unlink } from 'lucide-react';

interface SyncSettingsProps {
  listId: string;
}

export function SyncSettings({ listId }: SyncSettingsProps) {
  const { data: status, isLoading } = trpc.shopping.sync.getStatus.useQuery(listId);
  const { data: keepLists } = trpc.shopping.sync.getKeepLists.useQuery(
    undefined,
    { enabled: status?.connected }
  );

  const linkList = trpc.shopping.sync.linkList.useMutation();
  const triggerSync = trpc.shopping.sync.triggerSync.useMutation();
  const disconnect = trpc.shopping.sync.disconnect.useMutation();

  if (isLoading) return <Spinner />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <img src="/google-keep-icon.png" className="h-5 w-5" alt="" />
          Google Keep Sync
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!status?.connected ? (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Connect your Google account to sync this list with Google Keep.
            </p>
            <ConnectKeepForm />
          </div>
        ) : !status?.enabled ? (
          <div>
            <p className="text-sm text-muted-foreground mb-4">
              Select a Keep list to sync with:
            </p>
            <select
              className="w-full"
              onChange={(e) => linkList.mutate({ listId, keepListId: e.target.value })}
            >
              <option value="">Select a list...</option>
              {keepLists?.map((list) => (
                <option key={list.id} value={list.id}>{list.title}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Sync enabled</p>
                <p className="text-sm text-muted-foreground">
                  Last synced: {status.lastSyncedAt
                    ? new Date(status.lastSyncedAt).toLocaleString()
                    : 'Never'}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => triggerSync.mutate(listId)}
                disabled={triggerSync.isPending}
              >
                <RefreshCw className={cn('mr-2 h-4 w-4', triggerSync.isPending && 'animate-spin')} />
                Sync now
              </Button>
            </div>

            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => disconnect.mutate(listId)}
            >
              <Unlink className="mr-2 h-4 w-4" />
              Disconnect
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

## Implementation Steps

1. **Set Up Keep Service**
   - Create Python FastAPI service
   - Install gkeepapi
   - Implement connect, getLists, getList, syncItems

2. **Create Credentials Storage**
   - Table for Google credentials (encrypted)
   - Encryption utilities

3. **Build Sync Router**
   - Connect, link, sync, disconnect mutations
   - Status query

4. **Implement Merge Logic**
   - Compare HoneyDo and Keep states
   - Resolve conflicts (timestamp-based)
   - Track Keep item IDs

5. **Build Settings UI**
   - Connect form
   - List selector
   - Sync status and trigger

6. **Add Auto-Sync**
   - Interval when app is open
   - Consider background sync

7. **Handle Errors**
   - Auth failures
   - API changes
   - Network issues

## Security Considerations

- Master token stored encrypted
- Keep service runs locally (same machine as HoneyDo)
- No sensitive data sent to external services
- Consider: app-specific password instead of master token

## Definition of Done

- [ ] Can connect Google account
- [ ] Can select Keep list to sync
- [ ] Items sync both directions
- [ ] Manual sync trigger works
- [ ] Sync status displayed
- [ ] Can disconnect sync
- [ ] Errors handled gracefully

## Dependencies

- Feature 2.2 (Item Management) - items exist
- Python runtime for Keep service

## Risks

- Google Keep API is unofficial and may break
- Auth method may change
- Rate limits unknown

## Notes

- Consider fallback if Keep sync breaks
- Auto-sync interval: 5 minutes reasonable
- Sync indicator should show progress
