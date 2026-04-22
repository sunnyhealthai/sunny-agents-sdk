import type { AuthUpgradeProfileSyncData, AuthUpgradeRequest, SdkAuthConfig } from '../types.js';
import { TokenExchangeManager, type TokenExchangeConfig } from './tokenExchange.js';

/** Options for upgradeAuthIfPossible (token comes from token provider). */
export interface UpgradeAuthIfPossibleOptions {
  migrateHistory?: boolean;
  profileSync?: AuthUpgradeProfileSyncData | (() => Promise<AuthUpgradeProfileSyncData | null>);
}

export type IdTokenProvider = () => Promise<string | null | undefined>;
export type MessageHandler = (data: any) => void;
export type TokenProvider = () => Promise<string | null | undefined>;
export type AuthUpgradeHandler = (success: boolean, data: { user_id?: string; email?: string; error?: string; code?: string }) => void;

export interface LLMWebSocketConfig {
  websocketUrl?: string;
  sessionStorageKey?: string;
  idTokenProvider?: IdTokenProvider;
  tokenExchange?: TokenExchangeConfig;
  partnerName?: string;
  /** Public API key for SDK session creation. */
  publicKey?: string;
}

// Small, dependency-free WebSocket manager shared by the SDK.
export class LLMWebSocketManager {
  private ws: WebSocket | null = null;
  private connecting: Promise<WebSocket> | null = null;
  private listeners: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isAuthenticated: boolean = false;
  private authenticatedUserId: string | null = null;
  private currentSessionId: string | null = null;
  private tokenProvider?: TokenProvider;
  private authUpgradeHandlers: Set<AuthUpgradeHandler> = new Set();
  private pendingAuthUpgrade: Promise<boolean> | null = null;
  private readyChangeCallbacks: Set<() => void> = new Set();
  /** Fires whenever the WebSocket closes (including intentional close and failed connections). */
  private connectionCloseCallbacks: Set<() => void> = new Set();
  private tokenExchangeManager: TokenExchangeManager | null = null;
  /** Cached SDK auth config returned by sdk.session.created. */
  private sdkAuthConfig: SdkAuthConfig | null = null;
  /** Promise that resolves when sdk.session.created is received. */
  private sdkSessionPromise: {
    resolve: (config: SdkAuthConfig) => void;
    reject: (error: Error) => void;
  } | null = null;
  private sdkSessionReady: Promise<SdkAuthConfig> | null = null;
  /** Last options passed to upgradeAuthIfPossible, used on reconnect. */
  private lastUpgradeAuthIfPossibleOptions: UpgradeAuthIfPossibleOptions | null = null;
  /** Timeout handle for SDK session creation, so it can be cleared on close/reconnect. */
  private sdkSessionTimeout: ReturnType<typeof setTimeout> | null = null;
  /** The last token used for auth upgrade/refresh, used to check expiry before sends. */
  private lastAuthToken: string | null = null;
  private config: {
    websocketUrl: string;
    sessionStorageKey: string;
    idTokenProvider?: IdTokenProvider;
    tokenExchange?: TokenExchangeConfig;
    partnerName?: string;
    publicKey?: string;
  };

  constructor(config?: LLMWebSocketConfig) {
    this.config = {
      websocketUrl: config?.websocketUrl ?? 'wss://chat.api.sunnyhealthai-staging.com',
      sessionStorageKey: config?.sessionStorageKey ?? 'sunny_agents_session_id',
      idTokenProvider: config?.idTokenProvider,
      tokenExchange: config?.tokenExchange,
      partnerName: config?.partnerName,
      publicKey: config?.publicKey,
    };

    // Initialize token exchange manager if both idTokenProvider and tokenExchange are provided
    if (this.config.idTokenProvider && this.config.tokenExchange) {
      console.log('[LLMWebSocket] Initializing token exchange manager', {
        hasIdTokenProvider: !!this.config.idTokenProvider,
        tokenExchangeConfig: {
          partnerName: this.config.tokenExchange.partnerName,
          audience: this.config.tokenExchange.audience,
          clientId: this.config.tokenExchange.clientId,
          tokenExchangeUrl: this.config.tokenExchange.tokenExchangeUrl,
        },
      });
      this.applyTokenExchange(this.config.idTokenProvider, this.config.tokenExchange);
    } else {
      console.log('[LLMWebSocket] Token exchange not initialized', {
        hasIdTokenProvider: !!this.config.idTokenProvider,
        hasTokenExchange: !!this.config.tokenExchange,
      });
    }
  }

  private applyTokenExchange(idTokenProvider: IdTokenProvider, tokenExchange: TokenExchangeConfig): void {
    this.tokenExchangeManager = new TokenExchangeManager(idTokenProvider, tokenExchange);
    this.tokenProvider = async () => {
      try {
        return await this.tokenExchangeManager!.getAccessToken();
      } catch (error) {
        console.error('[LLMWebSocket] Token exchange failed:', error);
        return null;
      }
    };
  }

  setTokenProvider(provider: TokenProvider) {
    this.tokenProvider = provider;
  }

  setIdTokenProvider(provider: IdTokenProvider) {
    this.config.idTokenProvider = provider;
    if (this.config.idTokenProvider && this.config.tokenExchange) {
      this.applyTokenExchange(this.config.idTokenProvider, this.config.tokenExchange);
    } else {
      this.tokenExchangeManager = null;
      this.tokenProvider = undefined;
    }
  }

  // Subscribe to auth upgrade events
  onAuthUpgrade(handler: AuthUpgradeHandler): () => void {
    this.authUpgradeHandlers.add(handler);
    return () => {
      this.authUpgradeHandlers.delete(handler);
    };
  }

  // Subscribe to messages from the single connection
  onMessage(handler: MessageHandler): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  async send(payload: any): Promise<void> {
    await this.refreshAuthTokenIfNeeded();
    const socket = await this.connect();
    // Handle BigInt serialization by converting to numbers
    const serializedPayload = JSON.stringify(payload, (_key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    );
    socket.send(serializedPayload);
  }

  async connect(): Promise<WebSocket> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
        // All connections start anonymous - auth happens via auth.upgrade message
        // Use in-memory session ID for reconnection (if available within same instance)
        const backendUrl = this.config.websocketUrl;

        // Normalize the URL - handle http/https/ws/wss protocols
        let baseUrl = backendUrl;
        if (backendUrl.startsWith('http://')) {
          baseUrl = backendUrl.replace('http://', 'ws://');
        } else if (backendUrl.startsWith('https://')) {
          baseUrl = backendUrl.replace('https://', 'wss://');
        } else if (!backendUrl.startsWith('ws://') && !backendUrl.startsWith('wss://')) {
          // If no protocol specified, default to wss:// to avoid mixed-content issues
          baseUrl = `wss://${backendUrl}`;
        }

        // Construct WebSocket URL with /ws path
        const wsUrl = new URL('/ws', baseUrl);

        // Optional session_id (e.g. if set before connect). After any disconnect we clear it so the next
        // connection always starts a new server session — we do not resume the previous WebSocket session.
        if (this.currentSessionId) {
          wsUrl.searchParams.set('session_id', this.currentSessionId);
        }

        // Always include partner name if available (from config.partnerName or config.tokenExchange?.partnerName)
        const partnerName = this.config.partnerName ?? this.config.tokenExchange?.partnerName;
        if (partnerName) {
          wsUrl.searchParams.set('partner_identifier', partnerName);
        }

        const finalWsUrl = wsUrl.toString();
        console.log('[LLMWebSocket] Connecting to:', finalWsUrl);

        const socket = new WebSocket(finalWsUrl);
        this.ws = socket;

        socket.addEventListener('open', () => {
          // Reset reconnection attempts on successful connection
          this.reconnectAttempts = 0;
          if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
          }
        });

        socket.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data as string);

            // Handle session.started - store the server-provided session ID in memory only
            if (data.type === 'session.started') {
              this.currentSessionId = data.session_id;
              // If publicKey is configured, send sdk.session.create to verify and get config
              if (this.config.publicKey) {
                console.log('[LLMWebSocket] Session started, sending sdk.session.create');
                socket.send(JSON.stringify({
                  type: 'sdk.session.create',
                  api_key: this.config.publicKey,
                }));
              }
            }
            // Handle SDK session created - server returns auth config
            else if (data.type === 'sdk.session.created') {
              const config: SdkAuthConfig = data.config ?? {};
              this.sdkAuthConfig = config;
              console.log('[LLMWebSocket] SDK session created', { partner_id: data.partner_id, config });
              if (this.sdkSessionTimeout) {
                clearTimeout(this.sdkSessionTimeout);
                this.sdkSessionTimeout = null;
              }
              if (this.sdkSessionPromise) {
                this.sdkSessionPromise.resolve(config);
                this.sdkSessionPromise = null;
              }
            }
            // Handle SDK session creation failure
            else if (data.type === 'sdk.session.create_failed') {
              const error = new Error(`SDK session creation failed: ${data.error} (${data.code})`);
              console.error('[LLMWebSocket] SDK session creation failed:', data.error, data.code);
              if (this.sdkSessionTimeout) {
                clearTimeout(this.sdkSessionTimeout);
                this.sdkSessionTimeout = null;
              }
              if (this.sdkSessionPromise) {
                this.sdkSessionPromise.reject(error);
                this.sdkSessionPromise = null;
              }
            }
            // Handle auth upgrade responses
            else if (data.type === 'auth.upgraded') {
              this.isAuthenticated = true;
              this.authenticatedUserId = data.user_id;
              this.authUpgradeHandlers.forEach((handler) => {
                try { handler(true, { user_id: data.user_id, email: data.email }); } catch { }
              });
              this.readyChangeCallbacks.forEach((cb) => { try { cb(); } catch { } });
            } else if (data.type === 'auth.upgrade_failed') {
              this.authUpgradeHandlers.forEach((handler) => {
                try { handler(false, { error: data.error, code: data.code }); } catch { }
              });
            }
            // Handle token refresh responses
            else if (data.type === 'auth.refreshed') {
              console.log('[LLMWebSocket] Token refresh successful');
            } else if (data.type === 'auth.refresh_failed') {
              console.error('[LLMWebSocket] Token refresh failed:', data);
              // Backend could not renew the mcp_token (refresh token expired/revoked
              // or Auth0 rejected the grant). Flip to unauthenticated so downstream
              // UI — notably the verification flow card — treats the session as dead
              // and prompts the user to re-verify instead of showing a stale success
              // banner.
              if (this.isAuthenticated) {
                this.isAuthenticated = false;
                this.authenticatedUserId = null;
                this.readyChangeCallbacks.forEach((cb) => { try { cb(); } catch { } });
              }
            }

            // Forward all messages to listeners
            this.listeners.forEach((listener) => {
              try { listener(data); } catch { }
            });
          } catch {
            // ignore malformed events
          }
        });

        socket.addEventListener('close', (event) => {
          this.ws = null;
          this.connecting = null;
          const wasAuthenticated = this.isAuthenticated;
          this.isAuthenticated = false;
          this.authenticatedUserId = null;
          // Do not reuse server session after disconnect; next connect() omits session_id for a new session
          this.currentSessionId = null;
          this.sdkAuthConfig = null;
          this.sdkSessionReady = null;
          this.sdkSessionPromise = null;
          this.lastAuthToken = null;
          if (wasAuthenticated) {
            this.readyChangeCallbacks.forEach((cb) => { try { cb(); } catch { } });
          }
          if (this.sdkSessionTimeout) {
            clearTimeout(this.sdkSessionTimeout);
            this.sdkSessionTimeout = null;
          }

          this.connectionCloseCallbacks.forEach((cb) => {
            try {
              cb();
            } catch {
              /* ignore */
            }
          });

          // Auto-reconnect on unexpected closures (not normal closure)
          if (event.code !== 1000 && event.code !== 1001 && this.reconnectAttempts < 5) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000);

            this.reconnectTimeout = setTimeout(() => {
              this.connect()
                .then(() => {
                  // Re-authenticate if we had a token, reusing last options
                  this.upgradeAuthIfPossible(this.lastUpgradeAuthIfPossibleOptions ?? undefined);
                })
                .catch((error) => {
                  console.error('[LLMWebSocket] Reconnection failed:', error);
                });
            }, delay);
          } else if (this.reconnectAttempts >= 5) {
            console.error('[LLMWebSocket] Max reconnection attempts reached. Please refresh the page.');
          }
        });

        socket.addEventListener('error', (event) => {
          console.error('[LLMWebSocket] WebSocket error:', event);
        });

        if (socket.readyState === WebSocket.CONNECTING) {
          await new Promise<void>((resolve, reject) => {
            const onOpen = () => {
              cleanup();
              resolve();
            };
            const onError = (_e: Event) => {
              cleanup();
              reject(new Error(`WebSocket connection error: Failed to connect to ${finalWsUrl}. Make sure the server is running and accessible.`));
            };
            const onClose = (e: CloseEvent) => {
              cleanup();
              reject(new Error(`WebSocket closed before connection established (${e.code}): ${e.reason || 'No reason provided'}. URL: ${finalWsUrl}`));
            };
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
      } catch (error) {
        console.error('[LLMWebSocket] Connection failed:', error);
        this.ws = null;
        this.connecting = null;
        throw error;
      }
    })();

    return this.connecting;
  }

  /**
   * Upgrade the connection from anonymous to authenticated.
   * Accepts an options object with token, optional migrateHistory, and optional profile-sync data.
   */
  async upgradeAuth(options: AuthUpgradeRequest): Promise<boolean> {
    // Prevent concurrent upgrade attempts
    if (this.pendingAuthUpgrade) {
      return this.pendingAuthUpgrade;
    }

    const { token, migrateHistory = false, user_profile, user_address, insurances, dependents } = options;

    this.pendingAuthUpgrade = (async () => {
      try {
        const socket = await this.connect();

        if (this.isAuthenticated) {
          return true;
        }

        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            cleanup();
            resolve(false);
          }, 10000); // 10 second timeout

          const cleanup = () => {
            clearTimeout(timeout);
            unsubscribe();
          };

          const unsubscribe = this.onAuthUpgrade((success) => {
            cleanup();
            resolve(success);
          });

          const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
          this.lastAuthToken = cleanToken;
          const upgradePayload: Record<string, unknown> = {
            type: 'auth.upgrade',
            token: cleanToken,
            migrate_history: migrateHistory,
          };
          if (user_profile != null) upgradePayload.user_profile = user_profile;
          if (user_address != null) upgradePayload.user_address = user_address;
          if (insurances != null) upgradePayload.insurances = insurances;
          if (dependents != null) upgradePayload.dependents = dependents;

          console.log('[LLMWebSocket] Sending auth.upgrade message', {
            tokenLength: cleanToken.length,
            tokenPrefix: cleanToken.substring(0, 20) + '...',
            migrateHistory,
            hasProfileSync: !!(user_profile ?? user_address ?? insurances ?? dependents),
          });
          socket.send(JSON.stringify(upgradePayload));
        });
      } finally {
        this.pendingAuthUpgrade = null;
      }
    })();

    return this.pendingAuthUpgrade;
  }

  /**
   * Attempt to upgrade auth if we have a token provider.
   * Fetches token internally and sends optional profile-sync data.
   */
  async upgradeAuthIfPossible(options?: UpgradeAuthIfPossibleOptions): Promise<boolean> {
    const opts = options ?? {};
    const migrateHistory = opts.migrateHistory ?? false;
    this.lastUpgradeAuthIfPossibleOptions = opts;

    console.log('[LLMWebSocket] upgradeAuthIfPossible called', {
      hasTokenProvider: !!this.tokenProvider,
      migrateHistory,
      isAuthenticated: this.isAuthenticated,
    });

    if (!this.tokenProvider) {
      console.log('[LLMWebSocket] No token provider available, skipping auth upgrade');
      return false;
    }

    try {
      const token = await this.tokenProvider();
      if (!token) {
        console.warn('[LLMWebSocket] Token provider returned null/undefined, skipping auth upgrade');
        return false;
      }

      let profileSync: AuthUpgradeProfileSyncData | null = null;
      if (opts.profileSync != null) {
        profileSync = typeof opts.profileSync === 'function'
          ? await opts.profileSync()
          : opts.profileSync;
      }

      const authRequest: AuthUpgradeRequest = {
        token,
        migrateHistory,
        ...(profileSync ?? {}),
      };

      const success = await this.upgradeAuth(authRequest);
      console.log('[LLMWebSocket] Auth upgrade result:', success);
      return success;
    } catch (error) {
      console.error('[LLMWebSocket] Failed to get token for auth upgrade:', error);
      return false;
    }
  }

  getSessionId(): string | null {
    return this.currentSessionId || null;
  }

  getIsAuthenticated(): boolean {
    return this.isAuthenticated;
  }

  getIsAnonymous(): boolean {
    return !this.isAuthenticated;
  }

  getAuthenticatedUserId(): string | null {
    return this.authenticatedUserId;
  }

  /** Whether the connection is authenticated and ready for chat. */
  isReady(): boolean {
    return this.isAuthenticated;
  }

  /** Subscribe to ready-state changes (fires when isAuthenticated toggles). */
  onReadyChange(cb: () => void): () => void {
    this.readyChangeCallbacks.add(cb);
    return () => {
      this.readyChangeCallbacks.delete(cb);
    };
  }

  /**
   * Subscribe to WebSocket close events (any reason). Use to finalize UI when the transport drops;
   * the next connection uses a new server session — conversation identity is kept separately by the client.
   */
  onConnectionClose(cb: () => void): () => void {
    this.connectionCloseCallbacks.add(cb);
    return () => {
      this.connectionCloseCallbacks.delete(cb);
    };
  }

  /**
   * Gets an access token using token exchange if configured.
   * Returns null if no token provider is configured or if token exchange fails.
   */
  async getAccessToken(): Promise<string | null> {
    if (this.tokenProvider) {
      try {
        const token = await this.tokenProvider();
        return token === undefined ? null : token;
      } catch (error) {
        console.error('Token provider failed:', error);
        return null;
      }
    }
    return null;
  }

  /**
   * Refresh the auth token for an authenticated WebSocket session.
   * Sends an auth.refresh message with the new token (fire-and-forget).
   */
  async refreshToken(token: string): Promise<void> {
    const socket = await this.connect();
    const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
    this.lastAuthToken = cleanToken;
    socket.send(JSON.stringify({
      type: 'auth.refresh',
      token: cleanToken,
    }));
  }

  /**
   * Refresh token and wait for auth.refreshed or auth.refresh_failed response.
   * Resolves on success, rejects on failure or after timeoutMs.
   */
  async refreshTokenAndWait(token: string, timeoutMs: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        unsubscribe();
        reject(new Error('Token refresh timed out'));
      }, timeoutMs);

      const unsubscribe = this.onMessage((data) => {
        if (data.type === 'auth.refreshed') {
          clearTimeout(timeoutId);
          unsubscribe();
          resolve();
        } else if (data.type === 'auth.refresh_failed') {
          clearTimeout(timeoutId);
          unsubscribe();
          reject(new Error(data.error || 'Token refresh failed'));
        }
      });

      this.refreshToken(token).catch((err) => {
        clearTimeout(timeoutId);
        unsubscribe();
        reject(err);
      });
    });
  }

  /** Parse JWT exp claim to get token expiry time in milliseconds. */
  private getTokenExpiry(token: string): number | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      // Handle URL-safe base64 encoding used by JWTs
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      return payload.exp ? payload.exp * 1000 : null;
    } catch {
      return null;
    }
  }

  /** Check if the auth token is near expiry and refresh it before sending. */
  private async refreshAuthTokenIfNeeded(): Promise<void> {
    if (!this.isAuthenticated || !this.tokenProvider || !this.lastAuthToken) return;

    const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry
    const exp = this.getTokenExpiry(this.lastAuthToken);
    if (!exp || exp - Date.now() > REFRESH_BUFFER_MS) return;

    try {
      const freshToken = await this.getAccessToken();
      if (freshToken) {
        await this.refreshToken(freshToken);
      }
    } catch (error) {
      console.error('[LLMWebSocket] Auth token refresh before send failed:', error);
    }
  }

  /**
   * Waits for the SDK session to be created (sdk.session.created response).
   * Must be called after connect() when publicKey is configured.
   * Returns the server-provided SdkAuthConfig.
   */
  waitForSdkSession(): Promise<SdkAuthConfig> {
    // If already received, return cached config
    if (this.sdkAuthConfig) {
      return Promise.resolve(this.sdkAuthConfig);
    }

    // If already waiting, return the existing promise
    if (this.sdkSessionReady) {
      return this.sdkSessionReady;
    }

    // Create a new promise that will be resolved when sdk.session.created arrives
    this.sdkSessionReady = new Promise<SdkAuthConfig>((resolve, reject) => {
      this.sdkSessionPromise = { resolve, reject };

      // Timeout after 15 seconds
      this.sdkSessionTimeout = setTimeout(() => {
        if (this.sdkSessionPromise) {
          this.sdkSessionPromise.reject(new Error('SDK session creation timed out after 15 seconds'));
          this.sdkSessionPromise = null;
          this.sdkSessionTimeout = null;
        }
      }, 15000);
    });

    return this.sdkSessionReady;
  }

  /**
   * Returns the cached SDK auth config, or null if not yet received.
   */
  getSdkAuthConfig(): SdkAuthConfig | null {
    return this.sdkAuthConfig;
  }

  /**
   * Configures token exchange using server-provided config and a client-provided ID token provider.
   * Called by createSunnyChat after receiving SDK session config.
   */
  configureTokenExchange(idTokenProvider: IdTokenProvider, tokenExchangeConfig: TokenExchangeConfig): void {
    this.config.idTokenProvider = idTokenProvider;
    this.config.tokenExchange = tokenExchangeConfig;
    this.applyTokenExchange(idTokenProvider, tokenExchangeConfig);
  }

  close(): void {
    try { this.ws?.close(); } catch { }
    this.ws = null;
    this.connecting = null;
    this.isAuthenticated = false;
    this.authenticatedUserId = null;
    this.currentSessionId = null;
    this.lastAuthToken = null;

    // Clear any pending SDK session timeout
    if (this.sdkSessionTimeout) {
      clearTimeout(this.sdkSessionTimeout);
      this.sdkSessionTimeout = null;
    }

    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Reset reconnect attempts when explicitly closing
    this.reconnectAttempts = 0;
  }
}
