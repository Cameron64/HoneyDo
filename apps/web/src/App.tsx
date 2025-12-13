import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import { DebugPanel } from './components/common/DebugPanel';
import { useSocket } from './services/socket/hooks';

// Component to ensure socket connection at app level
function SocketManager() {
  useSocket();
  return null;
}

export function App() {
  return (
    <>
      <SocketManager />
      <RouterProvider router={router} />
      {import.meta.env.DEV && <DebugPanel />}
    </>
  );
}
