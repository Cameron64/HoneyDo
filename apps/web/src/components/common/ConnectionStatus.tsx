import { useSocket } from '@/services/socket/hooks';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ConnectionStatus() {
  const { status } = useSocket();

  const statusConfig = {
    connected: {
      icon: Wifi,
      color: 'text-green-500',
      label: 'Connected',
      animate: false,
    },
    connecting: {
      icon: Loader2,
      color: 'text-yellow-500',
      label: 'Connecting...',
      animate: true,
    },
    disconnected: {
      icon: WifiOff,
      color: 'text-gray-400',
      label: 'Disconnected',
      animate: false,
    },
    error: {
      icon: WifiOff,
      color: 'text-red-500',
      label: 'Connection error',
      animate: false,
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-1 text-xs', config.color)} title={config.label}>
      <Icon className={cn('h-3 w-3', config.animate && 'animate-spin')} />
      <span className="sr-only">{config.label}</span>
    </div>
  );
}
