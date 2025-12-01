import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { useHomeSync } from '../hooks/use-home-sync';
import { HAConnectionSettings } from './HAConnectionSettings';
import { EntityCard } from './EntityCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Lightbulb,
  Power,
  Thermometer,
  Star,
  Settings,
  RefreshCw,
  Loader2,
  WifiOff,
} from 'lucide-react';
import type { HADomain, HAEntityWithFavorite } from '@honeydo/shared';

const DOMAIN_TABS: { id: HADomain | 'favorites'; label: string; icon: React.ElementType }[] = [
  { id: 'favorites', label: 'Favorites', icon: Star },
  { id: 'light', label: 'Lights', icon: Lightbulb },
  { id: 'switch', label: 'Switches', icon: Power },
  { id: 'climate', label: 'Climate', icon: Thermometer },
];

export function HomeAutomationPage() {
  const [activeTab, setActiveTab] = useState<string>('favorites');
  const [showSettings, setShowSettings] = useState(false);

  // Set up real-time sync
  useHomeSync();

  const { data: status, isLoading: statusLoading } = trpc.home.config.getStatus.useQuery();
  const { data: entities, isLoading: entitiesLoading } = trpc.home.entities.getAll.useQuery(
    undefined,
    { enabled: status?.connected }
  );
  const { data: favorites } = trpc.home.favorites.getAllWithEntities.useQuery(undefined, {
    enabled: status?.connected,
  });

  const utils = trpc.useUtils();
  const addFavorite = trpc.home.favorites.add.useMutation({
    onSuccess: () => utils.home.favorites.getAllWithEntities.invalidate(),
  });
  const removeFavorite = trpc.home.favorites.remove.useMutation({
    onSuccess: () => utils.home.favorites.getAllWithEntities.invalidate(),
  });
  const refreshEntities = trpc.home.entities.refresh.useMutation({
    onSuccess: () => utils.home.entities.getAll.invalidate(),
  });

  const handleToggleFavorite = (entityId: string, isFavorite: boolean) => {
    if (isFavorite) {
      removeFavorite.mutate({ entityId });
    } else {
      addFavorite.mutate({ entityId });
    }
  };

  // Show settings if not configured
  if (statusLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!status?.configured || showSettings) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Home Automation</h1>
          {status?.configured && (
            <Button variant="outline" size="sm" onClick={() => setShowSettings(false)}>
              Back
            </Button>
          )}
        </div>
        <HAConnectionSettings />
      </div>
    );
  }

  if (!status?.connected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Home Automation</h1>
          <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)}>
            <Settings className="h-5 w-5" />
          </Button>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <WifiOff className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Disconnected from Home Assistant</p>
            {status?.lastError && (
              <p className="text-sm text-destructive">{status.lastError}</p>
            )}
            <Button onClick={() => setShowSettings(true)}>Reconnect</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const favoriteEntityIds = new Set(favorites?.map((f) => f.entityId) ?? []);

  const getEntitiesForTab = (tabId: string) => {
    if (tabId === 'favorites') {
      return favorites ?? [];
    }
    return (
      entities?.filter((e) => e.domain === tabId).map((e) => ({
        ...e,
        isFavorite: favoriteEntityIds.has(e.entityId),
      })) ?? []
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Home Automation</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refreshEntities.mutate()}
            disabled={refreshEntities.isPending}
          >
            {refreshEntities.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <RefreshCw className="h-5 w-5" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)}>
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          {DOMAIN_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {DOMAIN_TABS.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            {entitiesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <EntityGrid
                entities={getEntitiesForTab(tab.id) as HAEntityWithFavorite[]}
                onToggleFavorite={handleToggleFavorite}
                emptyMessage={
                  tab.id === 'favorites'
                    ? 'No favorites yet. Star an entity to add it here.'
                    : `No ${tab.label.toLowerCase()} found.`
                }
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

interface EntityGridProps {
  entities: HAEntityWithFavorite[];
  onToggleFavorite: (entityId: string, isFavorite: boolean) => void;
  emptyMessage: string;
}

function EntityGrid({ entities, onToggleFavorite, emptyMessage }: EntityGridProps) {
  if (entities.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {emptyMessage}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {entities.map((entity) => (
        <EntityCard
          key={entity.entityId}
          entity={entity}
          isFavorite={entity.isFavorite}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  );
}
