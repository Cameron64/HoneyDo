import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-0 right-0 z-50 flex justify-center md:bottom-4">
      <div className="flex items-center gap-2 rounded-full bg-yellow-500 px-4 py-2 text-sm text-yellow-950 shadow-lg">
        <WifiOff className="h-4 w-4" />
        <span>You're offline</span>
      </div>
    </div>
  );
}
