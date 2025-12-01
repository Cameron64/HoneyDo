import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  Lightbulb,
  Power,
  Fan,
  Thermometer,
  Lock,
  ArrowUpDown,
  Activity,
  ToggleLeft,
  Star,
  StarOff,
  Loader2,
} from 'lucide-react';
import type { HAEntity, HADomain } from '@honeydo/shared';

interface EntityCardProps {
  entity: HAEntity;
  isFavorite?: boolean;
  onToggleFavorite?: (entityId: string, isFavorite: boolean) => void;
  showFavoriteButton?: boolean;
}

const DOMAIN_ICONS: Record<HADomain, React.ElementType> = {
  light: Lightbulb,
  switch: Power,
  fan: Fan,
  climate: Thermometer,
  lock: Lock,
  cover: ArrowUpDown,
  sensor: Activity,
  binary_sensor: ToggleLeft,
};

export function EntityCard({
  entity,
  isFavorite = false,
  onToggleFavorite,
  showFavoriteButton = true,
}: EntityCardProps) {
  const utils = trpc.useUtils();

  const toggle = trpc.home.actions.toggle.useMutation({
    onMutate: async () => {
      // Optimistic update
      const newState = entity.state === 'on' ? 'off' : 'on';
      utils.home.entities.getAll.setData(undefined, (old) =>
        old?.map((e) => (e.entityId === entity.entityId ? { ...e, state: newState } : e))
      );
      utils.home.favorites.getAllWithEntities.setData(undefined, (old) =>
        old?.map((e) => (e.entityId === entity.entityId ? { ...e, state: newState } : e))
      );
    },
    onError: () => {
      // Revert on error
      utils.home.entities.getAll.invalidate();
      utils.home.favorites.getAllWithEntities.invalidate();
    },
  });

  const Icon = DOMAIN_ICONS[entity.domain] || Activity;
  const isOn = entity.state === 'on';
  const isControllable = ['light', 'switch', 'fan', 'cover'].includes(entity.domain);
  const isUnavailable = entity.state === 'unavailable';

  const handleClick = () => {
    if (!isControllable || isUnavailable) return;
    toggle.mutate({ entityId: entity.entityId });
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(entity.entityId, isFavorite);
  };

  return (
    <Card
      className={cn(
        'relative p-4 cursor-pointer transition-colors',
        isControllable && !isUnavailable && 'hover:bg-muted/50',
        isOn && 'bg-primary/10 border-primary/30',
        isUnavailable && 'opacity-50 cursor-not-allowed'
      )}
      onClick={handleClick}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'rounded-lg p-2',
            isOn
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {toggle.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Icon className="h-5 w-5" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {entity.friendlyName || entity.entityId}
          </p>
          <p className="text-xs text-muted-foreground capitalize">
            {formatState(entity)}
          </p>
        </div>

        {showFavoriteButton && onToggleFavorite && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleFavoriteClick}
          >
            {isFavorite ? (
              <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            ) : (
              <StarOff className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}

function formatState(entity: HAEntity): string {
  if (entity.state === 'unavailable') return 'Unavailable';

  switch (entity.domain) {
    case 'light':
      if (entity.state === 'on') {
        const brightness = entity.attributes?.brightness as number | undefined;
        if (brightness) {
          return `On (${Math.round((brightness / 255) * 100)}%)`;
        }
        return 'On';
      }
      return 'Off';

    case 'climate': {
      const temp = entity.attributes?.current_temperature as number | undefined;
      const unit = (entity.attributes?.temperature_unit as string) ?? '';
      if (temp) {
        return `${temp}${unit}`;
      }
      return entity.state ?? 'Unknown';
    }

    case 'lock':
      return entity.state === 'locked' ? 'Locked' : 'Unlocked';

    case 'sensor':
    case 'binary_sensor': {
      const unitOfMeasurement = entity.attributes?.unit_of_measurement as string | undefined;
      if (unitOfMeasurement) {
        return `${entity.state ?? ''} ${unitOfMeasurement}`;
      }
      return entity.state ?? 'Unknown';
    }

    default:
      return entity.state ?? 'Unknown';
  }
}
