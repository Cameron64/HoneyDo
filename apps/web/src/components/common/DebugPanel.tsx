import { useState, useEffect, useCallback } from 'react';
import { Bug, X, Copy, Check, Utensils, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { Switch } from '@/components/ui/switch';
import {
  useDebugStore,
  useFilteredErrors,
  useModuleErrorCounts,
  APP_MODULES,
  MODULE_LABELS,
  type AppModule,
} from '@/stores/debug';

export function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { selectedModule, setSelectedModule, clearErrors } = useDebugStore();
  const filteredErrors = useFilteredErrors();
  const moduleCounts = useModuleErrorCounts();
  const totalErrors = useDebugStore((s) => s.errors.length);

  const debugInfo = {
    // URLs
    pageUrl: window.location.href,
    origin: window.location.origin,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    port: window.location.port || '(default)',

    // API
    apiUrl: `${window.location.protocol}//${window.location.hostname}:3001`,
    envApiUrl: import.meta.env.VITE_API_URL || '(not set)',

    // Environment
    mode: import.meta.env.MODE,
    dev: import.meta.env.DEV,
    prod: import.meta.env.PROD,

    // Dev Flags (frontend)
    devBypassAuth: import.meta.env.VITE_DEV_BYPASS_AUTH === 'true',

    // Browser
    userAgent: navigator.userAgent,
    online: navigator.onLine,

    // PWA
    standalone: window.matchMedia('(display-mode: standalone)').matches,
    serviceWorker: 'serviceWorker' in navigator,
  };

  const copyToClipboard = async () => {
    const text = JSON.stringify(debugInfo, null, 2);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-50 p-2 rounded-full bg-orange-500 text-white shadow-lg"
        aria-label="Open debug panel"
      >
        <Bug className="h-5 w-5" />
        {totalErrors > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-[10px] font-bold flex items-center justify-center">
            {totalErrors > 9 ? '9+' : totalErrors}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/95 overflow-auto p-4">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Bug className="h-5 w-5" />
            Debug Panel
          </h2>
          <div className="flex gap-2">
            <button
              onClick={copyToClipboard}
              className="p-2 rounded bg-muted hover:bg-muted/80"
              aria-label="Copy debug info"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 rounded bg-muted hover:bg-muted/80"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <DebugSection title="URLs">
            <DebugRow label="Page URL" value={debugInfo.pageUrl} />
            <DebugRow label="Origin" value={debugInfo.origin} />
            <DebugRow label="Protocol" value={debugInfo.protocol} />
            <DebugRow label="Hostname" value={debugInfo.hostname} />
            <DebugRow label="Port" value={debugInfo.port} />
          </DebugSection>

          <DebugSection title="API">
            <DebugRow label="Computed API URL" value={debugInfo.apiUrl} />
            <DebugRow label="VITE_API_URL" value={debugInfo.envApiUrl} />
          </DebugSection>

          <DebugSection title="Environment">
            <DebugRow label="Mode" value={debugInfo.mode} />
            <DebugRow label="Dev" value={String(debugInfo.dev)} />
            <DebugRow label="Prod" value={String(debugInfo.prod)} />
          </DebugSection>

          <DebugSection title="Dev Flags">
            <DevFlagsDisplay devBypassAuthFrontend={debugInfo.devBypassAuth} />
          </DebugSection>

          <DebugSection title="Browser">
            <DebugRow label="Online" value={String(debugInfo.online)} />
            <DebugRow label="User Agent" value={debugInfo.userAgent} mono />
          </DebugSection>

          <DebugSection title="PWA">
            <DebugRow label="Standalone Mode" value={String(debugInfo.standalone)} />
            <DebugRow label="Service Worker Support" value={String(debugInfo.serviceWorker)} />
          </DebugSection>

          <DebugSection title="Test API">
            <ApiTest />
          </DebugSection>

          <DebugSection title="Meal Suggestions">
            <SuggestionsTest />
          </DebugSection>

          <DebugSection title="Errors by Module">
            <div className="space-y-3">
              {/* Module filter tabs */}
              <div className="flex flex-wrap gap-1">
                <ModuleTab
                  label="All"
                  count={totalErrors}
                  isSelected={selectedModule === 'all'}
                  onClick={() => setSelectedModule('all')}
                />
                {APP_MODULES.map((module) => (
                  <ModuleTab
                    key={module}
                    label={MODULE_LABELS[module]}
                    count={moduleCounts[module]}
                    isSelected={selectedModule === module}
                    onClick={() => setSelectedModule(module)}
                  />
                ))}
              </div>

              {/* Error list */}
              {filteredErrors.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {totalErrors === 0
                    ? 'No errors recorded'
                    : `No errors in ${selectedModule === 'all' ? 'any module' : MODULE_LABELS[selectedModule as AppModule]}`}
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {filteredErrors.length} error(s)
                      {selectedModule !== 'all' && ` in ${MODULE_LABELS[selectedModule as AppModule]}`}
                    </span>
                    <button
                      onClick={() => clearErrors(selectedModule === 'all' ? undefined : selectedModule as AppModule)}
                      className="flex items-center gap-1 text-xs text-destructive hover:underline"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear {selectedModule === 'all' ? 'All' : MODULE_LABELS[selectedModule as AppModule]}
                    </button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {filteredErrors.map((error) => (
                      <div key={error.id} className="p-2 rounded bg-destructive/10 border border-destructive/20">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium">
                                {MODULE_LABELS[error.module]}
                              </span>
                              <span className="text-xs font-medium text-destructive truncate">
                                {error.source}
                              </span>
                            </div>
                            <p className="text-xs text-destructive/80 break-words mt-1">{error.message}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">
                              {error.timestamp.toLocaleTimeString()}
                            </p>
                            {error.details !== undefined && error.details !== null && (
                              <details className="mt-1">
                                <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                                  Details
                                </summary>
                                <pre className="text-[10px] text-muted-foreground mt-1 overflow-x-auto p-1 bg-muted rounded">
                                  {JSON.stringify(error.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </DebugSection>
        </div>
      </div>
    </div>
  );
}

function DebugSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <h3 className="text-sm font-semibold text-muted-foreground mb-2">{title}</h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function DebugRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1">
      <span className="text-xs text-muted-foreground min-w-[120px]">{label}:</span>
      <span className={cn(
        'text-xs break-all',
        mono && 'font-mono text-[10px]'
      )}>
        {value}
      </span>
    </div>
  );
}

function ApiTest() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<string>('');

  const testApi = async () => {
    setStatus('loading');
    const apiUrl = `${window.location.protocol}//${window.location.hostname}:3001`;

    try {
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setResult(JSON.stringify(data, null, 2));
        setStatus('success');
      } else {
        setResult(`HTTP ${response.status}: ${response.statusText}`);
        setStatus('error');
      }
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={testApi}
        disabled={status === 'loading'}
        className="px-3 py-1 text-sm rounded bg-primary text-primary-foreground disabled:opacity-50"
      >
        {status === 'loading' ? 'Testing...' : 'Test API Health'}
      </button>

      {status !== 'idle' && (
        <div className={cn(
          'p-2 rounded text-xs font-mono',
          status === 'success' && 'bg-green-500/10 text-green-600',
          status === 'error' && 'bg-red-500/10 text-red-600',
          status === 'loading' && 'bg-muted'
        )}>
          {result || 'Loading...'}
        </div>
      )}
    </div>
  );
}

function ModuleTab({
  label,
  count,
  isSelected,
  onClick,
}: {
  label: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-1',
        isSelected
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted hover:bg-muted/80 text-muted-foreground'
      )}
    >
      {label}
      {count > 0 && (
        <span
          className={cn(
            'min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center',
            isSelected ? 'bg-primary-foreground/20' : 'bg-destructive text-destructive-foreground'
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

function DevFlagsDisplay({ devBypassAuthFrontend }: { devBypassAuthFrontend: boolean }) {
  const [apiConfig, setApiConfig] = useState<{
    devBypassAuth: boolean;
    mockMealSuggestions: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [isDev, setIsDev] = useState(false);

  const apiUrl = `${window.location.protocol}//${window.location.hostname}:3001`;

  const fetchApiConfig = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/health`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        setApiConfig(data.config || null);
      }
    } catch {
      // Silently fail - API might not be available
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchApiConfig();
    // Check if we're in development mode
    setIsDev(import.meta.env.DEV);
  }, [fetchApiConfig]);

  const toggleApiFlag = async (flag: 'devBypassAuth' | 'mockMealSuggestions', newValue: boolean) => {
    if (!isDev) return;

    setSaving(flag);
    try {
      const response = await fetch(`${apiUrl}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [flag]: newValue }),
      });

      if (response.ok) {
        const data = await response.json();
        setApiConfig(data.config);
      }
    } catch (err) {
      console.error('Failed to toggle flag:', err);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Development mode indicator */}
      {isDev && (
        <div className="text-[10px] text-muted-foreground bg-muted/50 px-2 py-1 rounded">
          Development mode - toggles are enabled
        </div>
      )}

      {/* Frontend flag (read-only, set via env var) */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Dev Bypass Auth (Frontend)</span>
          <span className="text-[10px] text-muted-foreground/60">Set via VITE_DEV_BYPASS_AUTH</span>
        </div>
        <span className={cn(
          'text-xs font-medium px-2 py-0.5 rounded',
          devBypassAuthFrontend
            ? 'bg-green-500/20 text-green-600'
            : 'bg-muted text-muted-foreground'
        )}>
          {devBypassAuthFrontend ? 'ON' : 'OFF'}
        </span>
      </div>

      {/* API flags */}
      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading API config...
        </div>
      ) : apiConfig ? (
        <>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Dev Bypass Auth (API)</span>
              <span className="text-[10px] text-muted-foreground/60">Skip Clerk auth checks</span>
            </div>
            <div className="flex items-center gap-2">
              {saving === 'devBypassAuth' && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              {isDev ? (
                <Switch
                  checked={apiConfig.devBypassAuth}
                  onCheckedChange={(checked) => toggleApiFlag('devBypassAuth', checked)}
                  disabled={saving !== null}
                  className="data-[state=checked]:bg-green-500"
                />
              ) : (
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded',
                  apiConfig.devBypassAuth
                    ? 'bg-green-500/20 text-green-600'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {apiConfig.devBypassAuth ? 'ON' : 'OFF'}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Mock Meal Suggestions</span>
              <span className="text-[10px] text-muted-foreground/60">Skip Claude API calls</span>
            </div>
            <div className="flex items-center gap-2">
              {saving === 'mockMealSuggestions' && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              {isDev ? (
                <Switch
                  checked={apiConfig.mockMealSuggestions}
                  onCheckedChange={(checked) => toggleApiFlag('mockMealSuggestions', checked)}
                  disabled={saving !== null}
                  className="data-[state=checked]:bg-yellow-500"
                />
              ) : (
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded',
                  apiConfig.mockMealSuggestions
                    ? 'bg-yellow-500/20 text-yellow-600'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {apiConfig.mockMealSuggestions ? 'ON' : 'OFF'}
                </span>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground">API config unavailable</div>
      )}
    </div>
  );
}

function SuggestionsTest() {
  const [status, setStatus] = useState<'idle' | 'requesting' | 'polling' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<string>('');
  const utils = trpc.useUtils();

  const requestMutation = trpc.recipes.suggestions.request.useMutation({
    onSuccess: (data) => {
      setResult(`Request ID: ${data.requestId}\nPolling for results...`);
      setStatus('polling');
      pollForResults(data.requestId);
    },
    onError: (error) => {
      setResult(`Error: ${error.message}`);
      setStatus('error');
    },
  });

  const pollForResults = async (requestId: string) => {
    const maxAttempts = 60; // 2 minutes max
    let attempts = 0;

    const poll = async () => {
      attempts++;
      try {
        const suggestion = await utils.recipes.suggestions.getById.fetch(requestId);

        if (suggestion?.status === 'received' && suggestion.suggestions) {
          const names = (suggestion.suggestions as Array<{ recipe: { name: string } }>)
            .map((s) => s.recipe.name);
          setResult(`Got ${names.length} suggestions:\n\n${names.join('\n')}`);
          setStatus('success');
        } else if (suggestion?.status === 'expired' && suggestion.error) {
          setResult(`Failed: ${suggestion.error}`);
          setStatus('error');
        } else if (attempts < maxAttempts) {
          setResult(`Waiting for Claude... (${attempts}s)`);
          setTimeout(poll, 1000);
        } else {
          setResult('Timeout waiting for suggestions');
          setStatus('error');
        }
      } catch (err) {
        setResult(`Poll error: ${err instanceof Error ? err.message : String(err)}`);
        setStatus('error');
      }
    };

    poll();
  };

  const handleRequest = () => {
    setStatus('requesting');
    setResult('Sending request to Claude...');

    // Request suggestions for next 7 days
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    requestMutation.mutate({
      dateRangeStart: today.toISOString().split('T')[0],
      dateRangeEnd: nextWeek.toISOString().split('T')[0],
      mealTypes: ['dinner'],
    });
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleRequest}
        disabled={status === 'requesting' || status === 'polling'}
        className="flex items-center gap-2 px-3 py-1 text-sm rounded bg-orange-500 text-white disabled:opacity-50"
      >
        <Utensils className="h-4 w-4" />
        {status === 'idle' ? 'Get Meal Suggestions' :
         status === 'requesting' ? 'Requesting...' :
         status === 'polling' ? 'Waiting for Claude...' :
         'Get Meal Suggestions'}
      </button>

      {status !== 'idle' && (
        <div className={cn(
          'p-2 rounded text-xs font-mono whitespace-pre-wrap',
          status === 'success' && 'bg-green-500/10 text-green-600',
          status === 'error' && 'bg-red-500/10 text-red-600',
          (status === 'requesting' || status === 'polling') && 'bg-orange-500/10 text-orange-600'
        )}>
          {result}
        </div>
      )}
    </div>
  );
}
