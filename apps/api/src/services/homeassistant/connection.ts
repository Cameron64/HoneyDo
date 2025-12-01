import WebSocket from 'ws';
import { EventEmitter } from 'events';
import type { HAEntity, StateChangedEvent } from '@honeydo/shared';

/**
 * Home Assistant WebSocket API Message Types
 */
interface HAMessage {
  id?: number;
  type: string;
  success?: boolean;
  result?: unknown;
  error?: { code: string; message: string };
  event?: {
    event_type: string;
    data: unknown;
  };
  [key: string]: unknown;
}

/**
 * Raw entity state from Home Assistant
 */
interface HAEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

/**
 * State changed event data from Home Assistant
 */
interface HAStateChangedData {
  entity_id: string;
  old_state: HAEntityState | null;
  new_state: HAEntityState;
}

/**
 * Pending request tracker
 */
interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * HomeAssistantConnection - WebSocket client for Home Assistant
 *
 * Provides:
 * - Persistent WebSocket connection with auto-reconnect
 * - Authentication handling
 * - Request/response message correlation
 * - State change event subscription
 * - Service call execution
 */
export class HomeAssistantConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private messageId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private isConnecting = false;
  private shouldReconnect = true;
  private stateSubscriptionId: number | null = null;

  constructor(url: string, token: string) {
    super();
    this.url = url;
    this.token = token;
  }

  /**
   * Connect to Home Assistant WebSocket API
   */
  async connect(): Promise<void> {
    if (this.isConnecting) {
      throw new Error('Connection already in progress');
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
          console.log('[HA] WebSocket connected');
        });

        this.ws.on('message', (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString()) as HAMessage;
            this.handleMessage(message, resolve, reject);
          } catch (error) {
            console.error('[HA] Failed to parse message:', error);
          }
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          console.log(`[HA] WebSocket closed: ${code} - ${reason.toString()}`);
          this.isConnecting = false;
          this.emit('disconnected');
          this.handleDisconnect();
        });

        this.ws.on('error', (error: Error) => {
          console.error('[HA] WebSocket error:', error.message);
          this.isConnecting = false;
          reject(error);
        });
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(
    message: HAMessage,
    connectResolve?: (value: void) => void,
    connectReject?: (reason: Error) => void
  ) {
    switch (message.type) {
      case 'auth_required':
        // Send authentication
        console.log('[HA] Auth required, sending token...');
        this.sendRaw({
          type: 'auth',
          access_token: this.token,
        });
        break;

      case 'auth_ok':
        console.log('[HA] Authentication successful');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.emit('connected');
        connectResolve?.();
        break;

      case 'auth_invalid':
        console.error('[HA] Authentication failed:', message.message);
        this.isConnecting = false;
        this.shouldReconnect = false;
        connectReject?.(new Error(message.message as string || 'Invalid access token'));
        break;

      case 'result':
        this.handleResult(message);
        break;

      case 'event':
        this.handleEvent(message);
        break;

      default:
        console.log('[HA] Unknown message type:', message.type);
    }
  }

  /**
   * Handle result messages (responses to requests)
   */
  private handleResult(message: HAMessage) {
    const id = message.id;
    if (id === undefined) return;

    const pending = this.pendingRequests.get(id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(id);

    if (message.success) {
      pending.resolve(message.result);
    } else {
      pending.reject(new Error(message.error?.message ?? 'Unknown error'));
    }
  }

  /**
   * Handle event messages (subscribed events)
   */
  private handleEvent(message: HAMessage) {
    const event = message.event;
    if (!event) return;

    if (event.event_type === 'state_changed') {
      const data = event.data as HAStateChangedData;
      this.emit('state_changed', {
        entityId: data.entity_id,
        oldState: data.old_state?.state ?? null,
        newState: data.new_state.state,
        attributes: data.new_state.attributes,
      } satisfies StateChangedEvent);
    }
  }

  /**
   * Handle disconnect and attempt reconnection
   */
  private handleDisconnect() {
    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
      this.pendingRequests.delete(id);
    }

    this.stateSubscriptionId = null;

    if (!this.shouldReconnect) {
      this.emit('failed', new Error('Connection closed'));
      return;
    }

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[HA] Reconnecting (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

      setTimeout(() => {
        this.connect().catch((error) => {
          console.error('[HA] Reconnection failed:', error.message);
        });
      }, this.reconnectDelay);
    } else {
      console.error('[HA] Max reconnection attempts reached');
      this.emit('failed', new Error('Max reconnection attempts reached'));
    }
  }

  /**
   * Send raw message (no ID tracking)
   */
  private sendRaw(message: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send message and wait for response
   */
  async send<T = unknown>(message: Omit<HAMessage, 'id'>): Promise<T> {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, 30000);

      this.pendingRequests.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
        timeout,
      });

      this.sendRaw({ ...message, id });
    });
  }

  /**
   * Get all entity states
   */
  async getStates(): Promise<HAEntity[]> {
    const states = await this.send<HAEntityState[]>({ type: 'get_states' });

    return states.map((state) => ({
      entityId: state.entity_id,
      domain: state.entity_id.split('.')[0] as HAEntity['domain'],
      friendlyName: state.attributes.friendly_name as string ?? null,
      state: state.state,
      attributes: state.attributes,
      areaId: state.attributes.area_id as string ?? null,
      lastChanged: state.last_changed,
      lastUpdated: state.last_updated,
    }));
  }

  /**
   * Call a Home Assistant service
   */
  async callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: { entity_id?: string | string[] }
  ): Promise<void> {
    await this.send({
      type: 'call_service',
      domain,
      service,
      service_data: data,
      target,
    });
  }

  /**
   * Subscribe to state change events
   */
  async subscribeToStateChanges(): Promise<number> {
    if (this.stateSubscriptionId !== null) {
      return this.stateSubscriptionId;
    }

    const result = await this.send<number>({
      type: 'subscribe_events',
      event_type: 'state_changed',
    });

    this.stateSubscriptionId = result;
    return result;
  }

  /**
   * Unsubscribe from state change events
   */
  async unsubscribeFromStateChanges(): Promise<void> {
    if (this.stateSubscriptionId === null) return;

    await this.send({
      type: 'unsubscribe_events',
      subscription: this.stateSubscriptionId,
    });

    this.stateSubscriptionId = null;
  }

  /**
   * Get connection status
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect from Home Assistant
   */
  disconnect() {
    this.shouldReconnect = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Clear all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Disconnected'));
      this.pendingRequests.delete(id);
    }
  }
}
