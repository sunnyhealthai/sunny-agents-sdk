import { TokenExchangeManager, type TokenExchangeConfig } from './tokenExchange.js';

export interface AuthorizeResponse {
  websocket_url: string;
  session_id: string;
  expires_at: string;
}

export type IdTokenProvider = () => Promise<string | null | undefined>;
export type MessageHandler = (data: any) => void;

export interface LLMWebSocketConfig {
  websocketUrl?: string;
  authorizeUrl?: string;
  sessionStorageKey?: string;
  idTokenProvider?: IdTokenProvider;
  tokenExchange?: TokenExchangeConfig;
  partnerName?: string;
}

// Small, dependency-free WebSocket manager shared by the SDK.
export class LLMWebSocketManager {
  private ws: WebSocket | null = null;
  private connecting: Promise<WebSocket> | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private session: AuthorizeResponse | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isAnonymous = true;
  private tokenExchangeManager: TokenExchangeManager | null = null;
  private config: {
    websocketUrl: string;
    authorizeUrl: string;
    sessionStorageKey: string;
    idTokenProvider?: IdTokenProvider;
    tokenExchange?: TokenExchangeConfig;
    partnerName?: string;
  };

  constructor(config?: LLMWebSocketConfig) {
    this.config = {
      websocketUrl: config?.websocketUrl ?? 'wss://chat.api.sunnyhealthai-staging.com',
      authorizeUrl: config?.authorizeUrl ?? 'https://chat.api.sunnyhealthai-staging.com/authorize',
      sessionStorageKey: config?.sessionStorageKey ?? 'sunny_agents_session_id',
      idTokenProvider: config?.idTokenProvider,
      tokenExchange: config?.tokenExchange,
      partnerName: config?.partnerName,
    };

    // Initialize token exchange manager if both idTokenProvider and tokenExchange are provided
    if (this.config.idTokenProvider && this.config.tokenExchange) {
      this.tokenExchangeManager = new TokenExchangeManager(
        this.config.idTokenProvider,
        this.config.tokenExchange
      );
    }
  }

  setIdTokenProvider(provider: IdTokenProvider) {
    this.config.idTokenProvider = provider;
    if (this.config.idTokenProvider && this.config.tokenExchange) {
      this.tokenExchangeManager = new TokenExchangeManager(
        this.config.idTokenProvider,
        this.config.tokenExchange
      );
    } else {
      this.tokenExchangeManager = null;
    }
  }

  getIsAnonymous(): boolean {
    return this.isAnonymous;
  }

  /**
   * Gets an access token using token exchange if configured.
   * Returns null if no token provider is configured or if token exchange fails.
   */
  async getAccessToken(): Promise<string | null> {
    return this.getAccessTokenInternal();
  }

  onMessage(handler: MessageHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  async send(payload: any): Promise<void> {
    const socket = await this.connect();
    const serialized = JSON.stringify(payload, (_k, v) =>
      typeof v === 'bigint' ? Number(v) : v
    );
    socket.send(serialized);
  }

  async connect(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
        const token = await this.getAccessTokenInternal();
        const { websocketUrl } = this.config;
        let wsUrl = websocketUrl;

        if (token) {
          this.isAnonymous = false;
          const session = await this.authorizeIfNeeded();
          const base = new URL(session.websocket_url);
          const url = new URL('/ws', `${base.protocol}//${base.host}`);
          url.protocol = 'wss:';
          url.searchParams.set('session_id', session.session_id);
          url.searchParams.set('access_token', `Bearer ${token}`);
          if (this.config.partnerName) {
            url.searchParams.set('partner', this.config.partnerName);
          }
          wsUrl = url.toString();
        } else {
          this.isAnonymous = true;
          const url = new URL('/ws', websocketUrl);
          url.protocol = 'wss:';
          url.searchParams.set('session_id', this.getAnonymousSessionId());
          if (this.config.partnerName) {
            url.searchParams.set('partner', this.config.partnerName);
          }
          wsUrl = url.toString();
        }

        const socket = new WebSocket(wsUrl);
        this.ws = socket;

        socket.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data as string);
            this.listeners.forEach((listener) => {
              try { listener(data); } catch { /* ignore listener errors */ }
            });
          } catch {
            // ignore parse errors
          }
        });

        socket.addEventListener('open', () => {
          this.reconnectAttempts = 0;
          if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
          }
        });

        socket.addEventListener('close', (event) => {
          this.ws = null;
          this.connecting = null;
          // Try to reconnect on abnormal closures
          if (event.code !== 1000 && event.code !== 1001 && this.reconnectAttempts < 5) {
            this.reconnectAttempts += 1;
            const delay = Math.min(1000 * 2 ** (this.reconnectAttempts - 1), 8000);
            this.reconnectTimeout = setTimeout(() => { void this.connect(); }, delay);
          }
        });

        socket.addEventListener('error', () => {
          this.ws = null;
          this.connecting = null;
        });

        if (socket.readyState === WebSocket.CONNECTING) {
          await new Promise<void>((resolve, reject) => {
            const onOpen = () => { cleanup(); resolve(); };
            const onError = () => { cleanup(); reject(new Error('WebSocket error')); };
            const onClose = () => { cleanup(); reject(new Error('WebSocket closed before ready')); };
            const cleanup = () => {
              socket.removeEventListener('open', onOpen);
              socket.removeEventListener('error', onError);
              socket.removeEventListener('close', onClose);
            };
            socket.addEventListener('open', onOpen);
            socket.addEventListener('error', onError);
            socket.addEventListener('close', onClose);
          });
        }

        this.connecting = null;
        return socket;
      } catch (err) {
        this.ws = null;
        this.connecting = null;
        throw err;
      }
    })();

    return this.connecting;
  }

  close(): void {
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
    this.connecting = null;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.reconnectAttempts = 0;
  }

  private getAnonymousSessionId(): string {
    const key = this.config.sessionStorageKey;
    const existing = typeof window !== 'undefined' ? window.localStorage?.getItem(key) : null;
    if (existing) return existing;
    const sessionId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try { window.localStorage?.setItem(key, sessionId); } catch { /* ignore */ }
    return sessionId;
  }

  private async authorizeIfNeeded(): Promise<AuthorizeResponse> {
    if (this.session) return this.session;
    const token = await this.getAccessTokenInternal();
    if (!token) {
      throw new Error('Cannot authorize websocket without a token');
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    if (this.config.partnerName) {
      headers['x-sunny-partner-identifier'] = this.config.partnerName;
    }

    const response = await fetch(this.config.authorizeUrl, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Authorization failed: ${response.status} ${await response.text()}`);
    }

    const session = await response.json() as AuthorizeResponse;
    this.session = session;
    return session;
  }

  private async getAccessTokenInternal(): Promise<string | null> {
    // Use token exchange manager if available
    if (this.tokenExchangeManager) {
      try {
        return await this.tokenExchangeManager.getAccessToken();
      } catch (error) {
        // If token exchange fails, return null to fall back to anonymous mode
        console.error('Token exchange failed:', error);
        return null;
      }
    }

    // Fallback: if idTokenProvider exists but no tokenExchange config, return null
    // (we don't support direct access tokens anymore)
    return null;
  }
}

