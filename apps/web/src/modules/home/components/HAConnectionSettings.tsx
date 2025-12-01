import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Home, Check, AlertCircle, Loader2, Unplug, RefreshCw } from 'lucide-react';

export function HAConnectionSettings() {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');

  const { data: status, isLoading } = trpc.home.config.getStatus.useQuery();
  const utils = trpc.useUtils();

  const testConnection = trpc.home.config.testConnection.useMutation({
    onSuccess: () => {
      // Test succeeded, refresh status
    },
  });

  const configure = trpc.home.config.configure.useMutation({
    onSuccess: () => {
      utils.home.config.getStatus.invalidate();
      utils.home.entities.getAll.invalidate();
      setUrl('');
      setToken('');
    },
  });

  const disconnect = trpc.home.config.disconnect.useMutation({
    onSuccess: () => {
      utils.home.config.getStatus.invalidate();
    },
  });

  const reconnect = trpc.home.config.reconnect.useMutation({
    onSuccess: () => {
      utils.home.config.getStatus.invalidate();
      utils.home.entities.getAll.invalidate();
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Home Assistant Connection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          Home Assistant Connection
        </CardTitle>
        <CardDescription>
          Connect HoneyDo to your Home Assistant instance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status?.connected ? (
          // Connected state
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <Check className="h-4 w-4" />
              <span className="font-medium">Connected</span>
            </div>

            {status.lastConnectedAt && (
              <p className="text-sm text-muted-foreground">
                Last connected: {new Date(status.lastConnectedAt).toLocaleString()}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => reconnect.mutate()}
                disabled={reconnect.isPending}
              >
                {reconnect.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Reconnect
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => disconnect.mutate()}
                disabled={disconnect.isPending}
              >
                {disconnect.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Unplug className="mr-2 h-4 w-4" />
                )}
                Disconnect
              </Button>
            </div>
          </div>
        ) : status?.configured ? (
          // Configured but disconnected
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">Disconnected</span>
            </div>

            {status.lastError && (
              <p className="text-sm text-destructive">Error: {status.lastError}</p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => reconnect.mutate()}
                disabled={reconnect.isPending}
              >
                {reconnect.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Reconnect
              </Button>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-4">
                Or enter new connection details:
              </p>
              <ConnectionForm
                url={url}
                token={token}
                setUrl={setUrl}
                setToken={setToken}
                testConnection={testConnection}
                configure={configure}
              />
            </div>
          </div>
        ) : (
          // Not configured
          <ConnectionForm
            url={url}
            token={token}
            setUrl={setUrl}
            setToken={setToken}
            testConnection={testConnection}
            configure={configure}
          />
        )}
      </CardContent>
    </Card>
  );
}

interface ConnectionFormProps {
  url: string;
  token: string;
  setUrl: (url: string) => void;
  setToken: (token: string) => void;
  testConnection: ReturnType<typeof trpc.home.config.testConnection.useMutation>;
  configure: ReturnType<typeof trpc.home.config.configure.useMutation>;
}

function ConnectionForm({
  url,
  token,
  setUrl,
  setToken,
  testConnection,
  configure,
}: ConnectionFormProps) {
  const handleTest = () => {
    testConnection.mutate({ url, accessToken: token });
  };

  const handleConnect = () => {
    configure.mutate({ url, accessToken: token });
  };

  const isValid = url.trim().length > 0 && token.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ha-url">Home Assistant URL</Label>
        <Input
          id="ha-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://homeassistant.local:8123"
        />
        <p className="text-xs text-muted-foreground">
          The URL of your Home Assistant instance (e.g., http://192.168.1.100:8123)
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ha-token">Long-Lived Access Token</Label>
        <Input
          id="ha-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="eyJ..."
        />
        <p className="text-xs text-muted-foreground">
          Create at: Your Profile &rarr; Security &rarr; Long-Lived Access Tokens
        </p>
      </div>

      {configure.error && (
        <p className="text-sm text-destructive">{configure.error.message}</p>
      )}

      {testConnection.data && (
        <p
          className={cn(
            'text-sm',
            testConnection.data.success ? 'text-green-600 dark:text-green-400' : 'text-destructive'
          )}
        >
          {testConnection.data.success
            ? `Success! Found ${testConnection.data.entityCount} entities.`
            : testConnection.data.error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={!isValid || testConnection.isPending}
        >
          {testConnection.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Test Connection
        </Button>
        <Button onClick={handleConnect} disabled={!isValid || configure.isPending}>
          {configure.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Connect
        </Button>
      </div>
    </div>
  );
}
