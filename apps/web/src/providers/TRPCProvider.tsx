import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc, createTRPCClient } from '@/lib/trpc';
import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { errorService } from '@/services/error-service';

interface TRPCProviderProps {
  children: ReactNode;
}

export function TRPCProvider({ children }: TRPCProviderProps) {
  const { getToken } = useAuth();

  // Initialize global error handlers once
  useEffect(() => {
    errorService.initGlobalHandlers();
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000,
            retry: 1,
          },
          mutations: {
            onError: (error) => {
              // Log all mutation errors to the error service
              const trpcError = error as { message: string; data?: { code?: string; path?: string } };
              errorService.logTrpcError(trpcError);
            },
          },
        },
      })
  );

  // Create tRPC client with the auth token getter
  // useMemo ensures we recreate client when getToken changes
  const trpcClient = useMemo(() => createTRPCClient(getToken), [getToken]);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
