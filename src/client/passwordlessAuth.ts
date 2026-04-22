import { TokenExchangeManager, type TokenExchangeConfig } from './tokenExchange.js';
import { LLMWebSocketManager } from './llmWebSocket.js';

export interface PasswordlessAuthConfig {
  /**
   * WebSocket manager instance for sending passwordless auth messages.
   * Required - passwordless auth now uses WebSocket backend instead of direct Auth0 calls.
   */
  wsManager: LLMWebSocketManager;
  /**
   * Whether to migrate anonymous chat history to authenticated user on successful auth.
   * Defaults to false.
   */
  migrateHistory?: boolean;
  /**
   * Optional token exchange configuration to obtain Sunny access tokens
   */
  tokenExchange?: TokenExchangeConfig;
  /**
   * Optional storage key for persisting auth state in sessionStorage/localStorage.
   * If not provided, auth state is stored in memory only.
   */
  storageKey?: string;
  /**
   * Storage type: 'memory' (default), 'sessionStorage', or 'localStorage'
   */
  storageType?: 'memory' | 'sessionStorage' | 'localStorage';
}

export interface PasswordlessStartOptions {
  email?: string;
  phoneNumber?: string;
}

export interface PasswordlessVerifyOptions {
  email?: string;
  phoneNumber?: string;
  code: string;
}

interface StoredAuthState {
  isAuthenticated: boolean;
  userId?: string;
  email?: string;
  expiresAt: number;
}

type AuthStateChangeCallback = (isAuthenticated: boolean) => void;
type OtpSentCallback = (connection: 'email' | 'sms') => void;

// WebSocket message types
interface PasswordlessStartMessage {
  type: 'passwordless.start';
  connection: 'email' | 'sms';
  email?: string;
  phone_number?: string;
}

interface PasswordlessVerifyMessage {
  type: 'passwordless.verify';
  otp: string;
  connection: 'email' | 'sms';
  email?: string;
  phone_number?: string;
  migrate_history?: boolean;
}

interface WebSocketMessage {
  type: string;
  app?: {
    type: string;
    connection?: string;
    error?: string;
    code?: string;
  };
  connection?: 'email' | 'sms'; // For passwordless.otp_sent messages
  user_id?: string;
  email?: string;
  error?: string;
  code?: string;
}

/**
 * Passwordless authentication manager using WebSocket backend.
 * Supports both email and SMS authentication with code verification.
 * 
 * All authentication operations are handled through the WebSocket connection,
 * eliminating page refreshes and redirects.
 */
export class PasswordlessAuthManager {
  private authState: StoredAuthState | null = null;
  private tokenExchangeManager: TokenExchangeManager | null = null;
  private authStateChangeListeners: Set<AuthStateChangeCallback> = new Set();
  private otpSentListeners: Set<OtpSentCallback> = new Set();
  private wsManager: LLMWebSocketManager;
  private config: Required<Pick<PasswordlessAuthConfig, 'migrateHistory' | 'storageType'>> &
    Omit<PasswordlessAuthConfig, 'migrateHistory' | 'storageType'>;
  private messageHandlerUnsubscribe: (() => void) | null = null;
  private pendingStartPromise: {
    resolve: () => void;
    reject: (error: Error) => void;
  } | null = null;
  private pendingVerifyPromise: {
    resolve: () => void;
    reject: (error: Error) => void;
  } | null = null;

  constructor(config: PasswordlessAuthConfig) {
    if (!config.wsManager) {
      throw new Error('wsManager is required for PasswordlessAuthManager');
    }

    this.config = {
      migrateHistory: config.migrateHistory ?? false,
      storageType: config.storageType ?? 'memory',
      ...config,
    };

    this.wsManager = config.wsManager;

    // Initialize token exchange manager if config provided
    if (this.config.tokenExchange) {
      this.tokenExchangeManager = new TokenExchangeManager(
        () => Promise.resolve(this.getIdToken()),
        this.config.tokenExchange
      );
    }

    // Set up WebSocket message handler for passwordless events
    this.setupMessageHandler();

    // Load auth state from storage if available
    this.loadAuthStateFromStorage();

    // Listen for auth upgrade events (from passwordless verify or manual upgrade)
    this.wsManager.onAuthUpgrade((success, data) => {
      if (success && data.user_id) {
        this.handleAuthUpgraded(data.user_id, data.email);
      }
    });
  }

  /**
   * Sets up WebSocket message handler for passwordless-specific messages
   */
  private setupMessageHandler(): void {
    const handler = (data: WebSocketMessage) => {
      // Handle passwordless.otp_sent - message comes directly, not wrapped in 'app'
      if (data.type === 'passwordless.otp_sent') {
        const connection = (data.connection || 'email') as 'email' | 'sms';
        // Notify all OTP sent listeners
        this.otpSentListeners.forEach((callback) => {
          try {
            callback(connection);
          } catch (error) {
            console.error('Error in OTP sent callback:', error);
          }
        });
        // Resolve the pending start promise
        if (this.pendingStartPromise) {
          this.pendingStartPromise.resolve();
          this.pendingStartPromise = null;
        }
        return;
      }

      // Handle passwordless.otp_sent_failed - message comes directly
      if (data.type === 'passwordless.otp_sent_failed') {
        if (this.pendingStartPromise) {
          const errorMsg = (data as any).error || 'Failed to send OTP';
          const error = new Error(errorMsg);
          this.pendingStartPromise.reject(error);
          this.pendingStartPromise = null;
        }
        return;
      }

      // Handle passwordless.verify_failed - message comes directly
      if (data.type === 'passwordless.verify_failed') {
        if (this.pendingVerifyPromise) {
          const errorMsg = (data as any).error || 'OTP verification failed';
          const error = new Error(errorMsg);
          this.pendingVerifyPromise.reject(error);
          this.pendingVerifyPromise = null;
        }
        return;
      }

      // Handle auth.upgraded (from passwordless verify)
      if (data.type === 'auth.upgraded' && data.user_id) {
        this.handleAuthUpgraded(data.user_id, data.email);
        if (this.pendingVerifyPromise) {
          this.pendingVerifyPromise.resolve();
          this.pendingVerifyPromise = null;
        }
        return;
      }

      // Backend tried to refresh the mcp_token and failed (refresh token expired
      // or revoked). Clear local auth state so the next {verification_flow} render
      // shows the real re-verify form instead of a stale success banner.
      if (data.type === 'auth.refresh_failed') {
        this.logout();
        return;
      }
    };

    this.messageHandlerUnsubscribe = this.wsManager.onMessage(handler);
  }

  /**
   * Handles successful auth upgrade
   */
  private handleAuthUpgraded(userId: string, email?: string): void {
    // Store auth state (expires in 24 hours by default, or use token expiration if available)
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

    this.authState = {
      isAuthenticated: true,
      userId,
      email,
      expiresAt,
    };

    this.saveAuthStateToStorage();
    this.notifyAuthStateChange(true);
  }

  /**
   * Starts the passwordless login flow by sending an OTP code via email or SMS.
   */
  async startLogin(options: PasswordlessStartOptions): Promise<void> {
    const { email, phoneNumber } = options;

    if (!email && !phoneNumber) {
      throw new Error('Either email or phoneNumber must be provided');
    }

    if (email && phoneNumber) {
      throw new Error('Cannot provide both email and phoneNumber');
    }

    const connection = email ? 'email' : 'sms';

    // Ensure WebSocket is connected
    await this.wsManager.connect();

    return new Promise<void>((resolve, reject) => {
      // Store promise handlers
      this.pendingStartPromise = { resolve, reject };

      // Set timeout for request
      const timeout = setTimeout(() => {
        if (this.pendingStartPromise) {
          this.pendingStartPromise.reject(new Error('Request timeout: Failed to send OTP'));
          this.pendingStartPromise = null;
        }
      }, 30000); // 30 second timeout

      // Override resolve/reject to clear timeout
      const originalResolve = resolve;
      const originalReject = reject;
      this.pendingStartPromise = {
        resolve: () => {
          clearTimeout(timeout);
          originalResolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          originalReject(error);
        },
      };

      const message: PasswordlessStartMessage = {
        type: 'passwordless.start',
        connection,
        ...(email ? { email } : { phone_number: phoneNumber }),
      };

      this.wsManager.send(message).catch((error) => {
        if (this.pendingStartPromise) {
          this.pendingStartPromise.reject(new Error(`Failed to send passwordless start: ${error.message}`));
          this.pendingStartPromise = null;
        }
      });
    });
  }

  /**
   * Verifies the OTP code and authenticates the user via WebSocket.
   */
  async verifyCode(options: PasswordlessVerifyOptions): Promise<void> {
    const { email, phoneNumber, code } = options;

    if (!email && !phoneNumber) {
      throw new Error('Either email or phoneNumber must be provided');
    }

    if (email && phoneNumber) {
      throw new Error('Cannot provide both email and phoneNumber');
    }

    const connection = email ? 'email' : 'sms';

    // Ensure WebSocket is connected
    await this.wsManager.connect();

    return new Promise<void>((resolve, reject) => {
      // Store promise handlers
      this.pendingVerifyPromise = { resolve, reject };

      // Set timeout for request
      const timeout = setTimeout(() => {
        if (this.pendingVerifyPromise) {
          this.pendingVerifyPromise.reject(new Error('Request timeout: Failed to verify OTP'));
          this.pendingVerifyPromise = null;
        }
      }, 30000); // 30 second timeout

      // Override resolve/reject to clear timeout
      const originalResolve = resolve;
      const originalReject = reject;
      this.pendingVerifyPromise = {
        resolve: () => {
          clearTimeout(timeout);
          originalResolve();
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          originalReject(error);
        },
      };

      const message: PasswordlessVerifyMessage = {
        type: 'passwordless.verify',
        otp: code,
        connection,
        migrate_history: this.config.migrateHistory,
        ...(email ? { email } : { phone_number: phoneNumber }),
      };

      this.wsManager.send(message).catch((error) => {
        if (this.pendingVerifyPromise) {
          this.pendingVerifyPromise.reject(new Error(`Failed to send passwordless verify: ${error.message}`));
          this.pendingVerifyPromise = null;
        }
      });
    });
  }

  /**
   * Gets the stored user ID, or null if not authenticated.
   * Note: With WebSocket auth, we don't store ID tokens locally.
   * The backend handles token management. This method returns the user ID
   * for compatibility with existing code that expects getIdToken().
   */
  getIdToken(): string | null {
    if (!this.authState || !this.authState.isAuthenticated) {
      return null;
    }

    // Check if auth state is expired
    if (this.authState.expiresAt <= Date.now()) {
      this.logout();
      return null;
    }

    // Return user ID as a placeholder token identifier
    // The actual token exchange will use the WebSocket connection's auth state
    return this.authState.userId || null;
  }

  /**
   * Gets the authenticated user ID, or null if not authenticated.
   */
  getUserId(): string | null {
    if (!this.authState || !this.authState.isAuthenticated) {
      return null;
    }

    if (this.authState.expiresAt <= Date.now()) {
      this.logout();
      return null;
    }

    return this.authState.userId || null;
  }

  /**
   * Gets the authenticated user's email, or null if not authenticated.
   */
  getEmail(): string | null {
    if (!this.authState || !this.authState.isAuthenticated) {
      return null;
    }

    if (this.authState.expiresAt <= Date.now()) {
      this.logout();
      return null;
    }

    return this.authState.email || null;
  }

  /**
   * Gets a Sunny access token via token exchange if configured.
   * Returns null if token exchange is not configured or if not authenticated.
   * 
   * Note: With WebSocket auth, the backend manages tokens. This method
   * uses the WebSocket connection's authentication state for token exchange.
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.tokenExchangeManager) {
      return null;
    }

    if (!this.isAuthenticated()) {
      return null;
    }

    // Use WebSocket manager's token provider if available
    // Otherwise, use token exchange with user ID as placeholder
    try {
      const wsToken = await this.wsManager.getAccessToken();
      if (wsToken) {
        return wsToken;
      }

      // Fallback to token exchange manager
      return await this.tokenExchangeManager.getAccessToken();
    } catch (error) {
      console.error('Token exchange failed:', error);
      return null;
    }
  }

  /**
   * Checks if the user is currently authenticated.
   *
   * Gated on the live WebSocket auth state — if the WS has disconnected or the
   * backend dropped authentication (e.g. the mcp_token expired and the refresh
   * grant failed, surfacing as `auth.refresh_failed`), this returns false even
   * if the local `authState.expiresAt` hasn't elapsed yet. This is what prevents
   * the "Verification successful!" card from rendering with no input when the
   * LLM asks for re-verification after a dead session.
   */
  isAuthenticated(): boolean {
    if (!this.authState || !this.authState.isAuthenticated) {
      return false;
    }

    // Check if auth state is expired
    if (this.authState.expiresAt <= Date.now()) {
      this.logout();
      return false;
    }

    // Gate on the live WebSocket authentication. The WS can drop auth while the
    // local authState is still within its 24h window; when that happens we must
    // report "not authenticated" so UI that depends on this (e.g. the verification
    // flow card) renders the re-verify form instead of a stale success banner.
    if (!this.wsManager.getIsAuthenticated()) {
      return false;
    }

    return true;
  }

  /**
   * Logs out the user by clearing stored auth state.
   */
  logout(): void {
    this.authState = null;
    this.tokenExchangeManager?.clearCache();
    this.clearAuthStateFromStorage();
    this.notifyAuthStateChange(false);
  }

  /**
   * Subscribes to authentication state changes.
   * Returns an unsubscribe function.
   */
  onAuthStateChange(callback: AuthStateChangeCallback): () => void {
    this.authStateChangeListeners.add(callback);
    return () => {
      this.authStateChangeListeners.delete(callback);
    };
  }

  /**
   * Subscribes to OTP sent events.
   * Called when passwordless.otp_sent message is received from the backend.
   * Returns an unsubscribe function.
   */
  onOtpSent(callback: OtpSentCallback): () => void {
    this.otpSentListeners.add(callback);
    return () => {
      this.otpSentListeners.delete(callback);
    };
  }

  /**
   * Cleanup method to remove message handlers
   */
  destroy(): void {
    if (this.messageHandlerUnsubscribe) {
      this.messageHandlerUnsubscribe();
      this.messageHandlerUnsubscribe = null;
    }
  }

  private notifyAuthStateChange(isAuthenticated: boolean): void {
    this.authStateChangeListeners.forEach((callback) => {
      try {
        callback(isAuthenticated);
      } catch (error) {
        console.error('Error in auth state change callback:', error);
      }
    });
  }

  private saveAuthStateToStorage(): void {
    if (!this.authState || !this.config.storageKey) {
      return;
    }

    try {
      const storage =
        this.config.storageType === 'localStorage'
          ? typeof localStorage !== 'undefined'
            ? localStorage
            : null
          : this.config.storageType === 'sessionStorage'
            ? typeof sessionStorage !== 'undefined'
              ? sessionStorage
              : null
            : null;

      if (storage) {
        storage.setItem(this.config.storageKey, JSON.stringify(this.authState));
      }
    } catch (error) {
      console.warn('Failed to save auth state to storage:', error);
    }
  }

  private loadAuthStateFromStorage(): void {
    if (!this.config.storageKey) {
      return;
    }

    try {
      const storage =
        this.config.storageType === 'localStorage'
          ? typeof localStorage !== 'undefined'
            ? localStorage
            : null
          : this.config.storageType === 'sessionStorage'
            ? typeof sessionStorage !== 'undefined'
              ? sessionStorage
              : null
            : null;

      if (storage) {
        const stored = storage.getItem(this.config.storageKey);
        if (stored) {
          const authState = JSON.parse(stored) as StoredAuthState;
          // Check if auth state is expired
          if (authState.expiresAt > Date.now()) {
            this.authState = authState;
            this.notifyAuthStateChange(true);
          } else {
            // Clear expired auth state
            this.clearAuthStateFromStorage();
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load auth state from storage:', error);
    }
  }

  private clearAuthStateFromStorage(): void {
    if (!this.config.storageKey) {
      return;
    }

    try {
      const storage =
        this.config.storageType === 'localStorage'
          ? typeof localStorage !== 'undefined'
            ? localStorage
            : null
          : this.config.storageType === 'sessionStorage'
            ? typeof sessionStorage !== 'undefined'
              ? sessionStorage
              : null
            : null;

      if (storage) {
        storage.removeItem(this.config.storageKey);
      }
    } catch (error) {
      console.warn('Failed to clear auth state from storage:', error);
    }
  }
}
