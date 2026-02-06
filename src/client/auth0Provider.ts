/**
 * Auth0 Provider for authentication via Auth0 Enterprise Connections (e.g., SAML).
 * Supports popup mode (no redirects), silent authentication, and redirect mode.
 */

export interface PopupOptions {
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

export interface Auth0ProviderConfig {
  domain: string;
  clientId: string;
  redirectUri: string;
  connection?: string;
  organization?: string;
  audience?: string;
  scope?: string;
  usePopup?: boolean;
  useModal?: boolean; // Use modal overlay instead of popup window (more native feel)
  popupOptions?: PopupOptions;
  storageType?: 'sessionStorage' | 'localStorage';
  storageKey?: string;
}

interface StoredTokens {
  idToken: string;
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}

interface Auth0TokenResponse {
  access_token: string;
  id_token: string;
  expires_in: number;
  refresh_token?: string;
  token_type: string;
}

/**
 * Auth0 authentication provider that supports popup mode (no redirects),
 * silent authentication, and redirect mode.
 */
export class Auth0Provider {
  private config: Required<Pick<Auth0ProviderConfig, 'usePopup' | 'useModal' | 'storageType' | 'scope' | 'storageKey'>> &
    Omit<Auth0ProviderConfig, 'usePopup' | 'useModal' | 'storageType' | 'scope' | 'storageKey'>;
  private tokens: StoredTokens | null = null;
  private auth0: any; // auth0-js WebAuth instance
  private pendingNonce: string | null = null;
  private modalOverlay: HTMLElement | null = null;
  private modalIframe: HTMLIFrameElement | null = null;

  constructor(config: Auth0ProviderConfig) {
    this.config = {
      usePopup: config.usePopup ?? true,
      useModal: config.useModal ?? true, // Default to modal overlay for native feel
      storageType: config.storageType ?? 'sessionStorage',
      scope: config.scope ?? 'openid profile email',
      storageKey: config.storageKey ?? 'auth0_tokens',
      ...config,
    };

    // Initialize auth0-js if available
    // Note: auth0-js will be loaded dynamically if available
    // If not available, we'll use native fetch API implementation
    this.auth0 = null;

    if (typeof window !== 'undefined') {
      // Try to initialize auth0-js (will be set up lazily when needed)
      this.initializeAuth0();
    }

    // Load tokens from storage
    this.loadTokensFromStorage();
  }

  /**
   * Generates a random nonce for OAuth security.
   */
  private generateNonce(): string {
    const array = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(array);
    } else {
      // Fallback for environments without crypto.getRandomValues
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Initializes auth0-js WebAuth instance if available.
   */
  private initializeAuth0(): void {
    if (this.auth0 !== null) {
      return; // Already initialized or attempted
    }

    try {
      // Try to use auth0-js if available (it's an optional dependency)
      // In a browser environment, this would need to be imported at build time
      // For now, we'll use native implementation as fallback
      this.auth0 = null; // Will use native implementation
    } catch (error) {
      console.warn('[Auth0Provider] auth0-js not available, using native fetch API');
      this.auth0 = null;
    }
  }

  /**
   * Attempts silent authentication using checkSession (iframe-based).
   * No UI is shown if user already has an Auth0 session.
   * 
   * Note: Silent authentication requires auth0-js library.
   * If not available, this will throw an error.
   * Use authorizePopup() or authorizeRedirect() for authentication without auth0-js.
   */
  async checkSession(): Promise<void> {
    // Silent authentication requires iframe which needs auth0-js
    // For now, we'll skip silent auth if auth0-js is not available
    // Users can still use popup or redirect modes
    throw new Error('Silent authentication requires auth0-js library. Use authorizePopup() or authorizeRedirect() instead.');
  }

  /**
   * Opens Auth0 authorization in a popup window or modal overlay (no page redirect).
   * Returns a Promise that resolves when authentication completes.
   */
  async authorizePopup(): Promise<void> {
    // Use modal overlay if configured (more native feel)
    if (this.config.useModal) {
      return this.authorizeModal();
    }
    // Use native popup implementation (works without auth0-js)
    return this.authorizePopupNative();
  }

  /**
   * Modal overlay implementation - creates a native-feeling modal instead of popup window.
   * Falls back to popup window if iframe is blocked (e.g., X-Frame-Options).
   */
  private async authorizeModal(): Promise<void> {
    // Generate and store nonce for this authorization request
    const nonce = this.generateNonce();
    this.pendingNonce = nonce;
    this.saveNonceToStorage(nonce);

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'token id_token',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      nonce: nonce,
      ...(this.config.audience ? { audience: this.config.audience } : {}),
      ...(this.config.connection ? { connection: this.config.connection } : {}),
      ...(this.config.organization ? { organization: this.config.organization } : {}),
    });

    const authUrl = `https://${this.config.domain}/authorize?${params.toString()}`;

    return new Promise<void>((resolve, reject) => {
      // Create modal overlay
      this.createModalOverlay();

      if (!this.modalIframe) {
        reject(new Error('Failed to create modal iframe'));
        return;
      }

      let iframeBlocked = false;
      let fallbackToPopup = false;

      // Detect iframe load errors (X-Frame-Options, CSP, etc.)
      const iframeErrorHandler = () => {
        if (!iframeBlocked) {
          iframeBlocked = true;
          console.warn('[Auth0Provider] Iframe blocked, falling back to popup window');
          this.closeModalOverlay();
          fallbackToPopup = true;
          // Fall back to popup window
          this.authorizePopupNative()
            .then(resolve)
            .catch(reject);
        }
      };

      this.modalIframe.onerror = iframeErrorHandler;

      // Track if iframe successfully loaded content
      let iframeLoaded = false;

      this.modalIframe.onload = () => {
        try {
          if (this.modalIframe && this.modalIframe.contentWindow) {
            const iframeUrl = this.modalIframe.contentWindow.location.href;
            // If iframe loaded something other than about:blank, it's working
            if (iframeUrl && iframeUrl !== 'about:blank' && iframeUrl !== '') {
              iframeLoaded = true;
              return;
            }
          }
        } catch (e) {
          // Cross-origin error - this is expected when Auth0 redirects to external IdP
          // Don't treat this as blocking, it's normal for SAML flows
          iframeLoaded = true; // Assume it loaded if we can't check
          return;
        }

        // If we get here and iframe is still blank, check again after delay
        setTimeout(() => {
          if (!fallbackToPopup && !iframeLoaded && this.modalIframe) {
            try {
              if (this.modalIframe.contentWindow) {
                const checkUrl = this.modalIframe.contentWindow.location.href;
                // If still blank, likely blocked by X-Frame-Options
                if (checkUrl === 'about:blank' || checkUrl === '') {
                  console.warn('[Auth0Provider] Iframe appears blocked (X-Frame-Options), falling back to popup window');
                  iframeErrorHandler();
                }
              }
            } catch (e) {
              // Can't access - might be blocked or might be cross-origin redirect
              // For SAML flows, cross-origin is normal, so don't auto-fallback
              // The user will see the error and can retry with popup
            }
          }
        }, 1500);
      };

      // Set iframe source with error handling
      this.modalIframe.src = authUrl;

      // Detect iframe blocking immediately
      const detectBlocking = setTimeout(() => {
        try {
          if (this.modalIframe && this.modalIframe.contentWindow) {
            const testUrl = this.modalIframe.contentWindow.location.href;
            // If still about:blank after a delay, likely blocked
            if (testUrl === 'about:blank' || testUrl === '') {
              if (!fallbackToPopup) {
                console.warn('[Auth0Provider] Iframe appears blocked, falling back to popup');
                iframeErrorHandler();
              }
            }
          }
        } catch (e) {
          // Cross-origin error - might be blocked or might be normal redirect
          // Don't immediately assume blocking, wait for actual error
        }
      }, 1000);

      // Monitor iframe for blocking - check if content loads
      // If iframe stays at about:blank or we can't access it due to X-Frame-Options,
      // it's likely blocked
      const checkIframeBlocked = setInterval(() => {
        if (fallbackToPopup) {
          clearInterval(checkIframeBlocked);
          return;
        }

        try {
          if (!this.modalIframe || !this.modalIframe.contentWindow) {
            return;
          }

          const iframeUrl = this.modalIframe.contentWindow.location.href;
          // If iframe is still blank after loading, it might be blocked
          if (iframeUrl === 'about:blank' || iframeUrl === '') {
            // Already handled in onload
            return;
          }

          // If we can access the URL, it's not blocked
          clearInterval(checkIframeBlocked);
        } catch (e) {
          // Cross-origin error - this is normal if Auth0 redirects to external IdP
          // But if it happens immediately, it might be X-Frame-Options blocking
          // Wait a bit to see if it's just a redirect
          const errorMsg = e instanceof Error ? e.message : String(e);
          if (errorMsg.includes('frame') || errorMsg.includes('cross-origin')) {
            // This might be normal redirect, give it time
            // If we still can't access after delay, fall back
            setTimeout(() => {
              if (!fallbackToPopup && this.modalIframe) {
                try {
                  // Try one more time
                  const test = this.modalIframe.contentWindow?.location.href;
                  // If we still can't access and it's been a while, fall back
                } catch (e2) {
                  // Still blocked - but this might be normal for SAML redirects
                  // Don't auto-fallback, let the user see the error or handle it
                }
              }
            }, 2000);
          }
        }
      }, 200);

      // Listen for messages from iframe
      const messageHandler = (event: MessageEvent) => {
        if (fallbackToPopup) {
          return; // Ignore messages if we've fallen back to popup
        }

        // Only accept messages from Auth0 domain
        if (event.origin !== `https://${this.config.domain}`) {
          return;
        }

        // Handle Auth0 postMessage responses
        if (event.data && event.data.type === 'authorization_response') {
          window.removeEventListener('message', messageHandler);
          this.closeModalOverlay();

          if (event.data.error) {
            reject(new Error(event.data.error.description || event.data.error.error));
            return;
          }

          if (event.data.response && event.data.response.access_token) {
            const returnedNonce = event.data.response.nonce;
            if (returnedNonce && !this.validateNonce(returnedNonce)) {
              reject(new Error('Invalid nonce in response'));
              return;
            }

            this.setTokens({
              idToken: event.data.response.id_token,
              accessToken: event.data.response.access_token,
              expiresAt: Date.now() + (event.data.response.expires_in || 3600) * 1000,
              refreshToken: event.data.response.refresh_token,
            });
            this.clearNonceFromStorage();
            this.pendingNonce = null;
            resolve();
          }
        }
      };

      window.addEventListener('message', messageHandler);

      // Also listen for URL changes in iframe (for redirect-based flows)
      const checkIframeUrl = setInterval(() => {
        if (fallbackToPopup) {
          clearInterval(checkIframeUrl);
          return;
        }

        try {
          if (!this.modalIframe || !this.modalIframe.contentWindow) {
            return;
          }

          const iframeUrl = this.modalIframe.contentWindow.location.href;
          if (iframeUrl.includes('#') || iframeUrl.includes('?')) {
            clearInterval(checkIframeUrl);
            window.removeEventListener('message', messageHandler);

            const hash = this.modalIframe.contentWindow.location.hash.substring(1);
            const urlParams = new URLSearchParams(hash);
            const accessToken = urlParams.get('access_token');
            const idToken = urlParams.get('id_token');
            const expiresIn = urlParams.get('expires_in');
            const error = urlParams.get('error');
            const errorDescription = urlParams.get('error_description');
            const returnedNonce = urlParams.get('nonce');

            if (error) {
              this.closeModalOverlay();
              reject(new Error(errorDescription || error));
              return;
            }

            if (accessToken && idToken) {
              if (!this.validateNonce(returnedNonce)) {
                this.closeModalOverlay();
                reject(new Error('Invalid nonce in response'));
                return;
              }

              this.setTokens({
                idToken,
                accessToken,
                expiresAt: Date.now() + (parseInt(expiresIn || '3600') * 1000),
                refreshToken: urlParams.get('refresh_token') || undefined,
              });
              this.clearNonceFromStorage();
              this.pendingNonce = null;
              this.closeModalOverlay();
              resolve();
            }
          }
        } catch (e) {
          // Cross-origin error - iframe not ready or redirected to different domain
          // This is expected when Auth0 redirects to external IdP (e.g., Google for SAML)
          // In this case, we should fall back to popup window
          if (!fallbackToPopup && e instanceof Error && e.message.includes('frame')) {
            console.warn('[Auth0Provider] Cross-origin iframe access blocked, falling back to popup');
            clearInterval(checkIframeUrl);
            window.removeEventListener('message', messageHandler);
            iframeErrorHandler();
          }
        }
      }, 100);

      // Cleanup on modal close
      const cleanup = () => {
        clearInterval(checkIframeUrl);
        clearInterval(checkIframeBlocked);
        clearTimeout(detectBlocking);
        window.removeEventListener('message', messageHandler);
      };

      // Store cleanup function for modal close handler
      if (this.modalOverlay) {
        (this.modalOverlay as any)._cleanup = cleanup;
      }
    });
  }

  /**
   * Creates a native-feeling modal overlay for authentication.
   */
  private createModalOverlay(): void {
    // Remove existing modal if present
    this.closeModalOverlay();

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(33, 33, 36, 0.85);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      opacity: 0;
      transition: opacity 200ms ease;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      position: relative;
      width: 500px;
      max-width: calc(100vw - 32px);
      height: 600px;
      max-height: calc(100vh - 64px);
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.04), 0 8px 16px rgba(0, 0, 0, 0.08), 0 24px 48px rgba(0, 0, 0, 0.16);
      transform: scale(0.96) translateY(8px);
      transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease;
    `;

    const closeButton = document.createElement('button');
    closeButton.innerHTML = `
      <svg viewBox="0 0 24 24" style="width: 18px; height: 18px;" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
      </svg>
    `;
    closeButton.style.cssText = `
      position: absolute;
      top: 12px;
      right: 12px;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: #838691;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10;
      transition: background 120ms ease, color 120ms ease;
    `;
    closeButton.onmouseover = () => {
      closeButton.style.background = '#f6f6f8';
      closeButton.style.color = '#52535a';
    };
    closeButton.onmouseout = () => {
      closeButton.style.background = 'transparent';
      closeButton.style.color = '#838691';
    };
    closeButton.onclick = () => {
      this.closeModalOverlay();
    };

    const iframe = document.createElement('iframe');
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: #fff;
    `;
    iframe.allow = 'clipboard-read; clipboard-write';

    modal.appendChild(closeButton);
    modal.appendChild(iframe);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      modal.style.transform = 'scale(1) translateY(0)';
      modal.style.opacity = '1';
    });

    // Close on backdrop click
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        this.closeModalOverlay();
      }
    };

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    this.modalOverlay = overlay;
    this.modalIframe = iframe;
  }

  /**
   * Closes the modal overlay.
   */
  private closeModalOverlay(): void {
    if (this.modalOverlay) {
      // Run cleanup if stored
      if ((this.modalOverlay as any)._cleanup) {
        (this.modalOverlay as any)._cleanup();
      }

      // Animate out
      const overlay = this.modalOverlay;
      const modal = overlay.querySelector('div') as HTMLElement;
      if (modal) {
        modal.style.transform = 'scale(0.96) translateY(8px)';
        modal.style.opacity = '0';
      }
      overlay.style.opacity = '0';

      setTimeout(() => {
        if (overlay.parentElement) {
          overlay.parentElement.removeChild(overlay);
        }
        document.body.style.overflow = '';
      }, 200);

      this.modalOverlay = null;
      this.modalIframe = null;
    }
  }

  /**
   * Native popup implementation using fetch API (fallback when auth0-js is not available).
   */
  private async authorizePopupNative(): Promise<void> {
    const popupOptions = this.config.popupOptions || {};
    const width = popupOptions.width || 500;
    const height = popupOptions.height || 600;
    const left = popupOptions.left || (window.screen.width - width) / 2;
    const top = popupOptions.top || (window.screen.height - height) / 2;

    const popup = window.open(
      '',
      'auth0-popup',
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      throw new Error('Popup blocked. Please allow popups for this site.');
    }

    // Generate and store nonce for this authorization request
    const nonce = this.generateNonce();
    this.pendingNonce = nonce;
    this.saveNonceToStorage(nonce);

    // Build authorization URL
    const params = new URLSearchParams({
      response_type: 'token id_token',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      nonce: nonce,
      ...(this.config.audience ? { audience: this.config.audience } : {}),
      ...(this.config.connection ? { connection: this.config.connection } : {}),
      ...(this.config.organization ? { organization: this.config.organization } : {}),
    });

    const authUrl = `https://${this.config.domain}/authorize?${params.toString()}`;
    popup.location.href = authUrl;

    return new Promise<void>((resolve, reject) => {
      const checkPopupHash = setInterval(() => {
        try {
          if (popup.closed) {
            clearInterval(checkPopupHash);
            if (!this.isAuthenticated()) {
              reject(new Error('Authentication cancelled'));
            }
            return;
          }

          const popupUrl = popup.location.href;
          if (popupUrl.includes('#') || popupUrl.includes('?')) {
            clearInterval(checkPopupHash);

            const hash = popup.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');
            const idToken = params.get('id_token');
            const expiresIn = params.get('expires_in');
            const error = params.get('error');
            const errorDescription = params.get('error_description');

            if (error) {
              popup.close();
              reject(new Error(errorDescription || error));
              return;
            }

            if (accessToken && idToken) {
              this.setTokens({
                idToken,
                accessToken,
                expiresAt: Date.now() + (parseInt(expiresIn || '3600') * 1000),
                refreshToken: params.get('refresh_token') || undefined,
              });
              popup.close();
              resolve();
            }
          }
        } catch (e) {
          // Cross-origin error, popup not ready yet
        }
      }, 100);
    });
  }

  /**
   * Redirects the current page to Auth0 for authentication (full page redirect).
   */
  authorizeRedirect(): void {
    // Generate and store nonce for this authorization request
    const nonce = this.generateNonce();
    this.pendingNonce = nonce;
    this.saveNonceToStorage(nonce);

    const params = new URLSearchParams({
      response_type: 'token id_token',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      nonce: nonce,
      ...(this.config.audience ? { audience: this.config.audience } : {}),
      ...(this.config.connection ? { connection: this.config.connection } : {}),
      ...(this.config.organization ? { organization: this.config.organization } : {}),
    });

    const authUrl = `https://${this.config.domain}/authorize?${params.toString()}`;
    window.location.href = authUrl;
  }

  /**
   * Handles the Auth0 callback after redirect authentication.
   * Call this on your callback page after redirect.
   */
  async handleCallback(): Promise<void> {
    // Use native implementation (works without auth0-js)
    return this.handleCallbackNative();
  }

  /**
   * Native callback handler using URL hash parsing.
   */
  private async handleCallbackNative(): Promise<void> {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const idToken = params.get('id_token');
    const expiresIn = params.get('expires_in');
    const error = params.get('error');
    const errorDescription = params.get('error_description');
    const returnedNonce = params.get('nonce');

    if (error) {
      throw new Error(errorDescription || error);
    }

    if (!accessToken || !idToken) {
      throw new Error('No tokens in callback');
    }

    // Validate nonce
    if (!this.validateNonce(returnedNonce)) {
      throw new Error('Invalid nonce in callback');
    }

    this.setTokens({
      idToken,
      accessToken,
      expiresAt: Date.now() + (parseInt(expiresIn || '3600') * 1000),
      refreshToken: params.get('refresh_token') || undefined,
    });
    this.clearNonceFromStorage();
    this.pendingNonce = null;
  }

  /**
   * Gets the current ID token, or null if not authenticated.
   */
  getIdToken(): string | null {
    if (!this.tokens || this.tokens.expiresAt <= Date.now()) {
      return null;
    }
    return this.tokens.idToken;
  }

  /**
   * Gets the current access token, or null if not authenticated.
   */
  getAccessToken(): string | null {
    if (!this.tokens || this.tokens.expiresAt <= Date.now()) {
      return null;
    }
    return this.tokens.accessToken;
  }

  /**
   * Checks if the user is currently authenticated.
   */
  isAuthenticated(): boolean {
    return this.getIdToken() !== null;
  }

  /**
   * Logs out the user and clears stored tokens.
   * Optionally redirects to Auth0 logout endpoint.
   */
  logout(redirectToLogout = false, returnTo?: string): void {
    this.tokens = null;
    this.clearTokensFromStorage();
    this.closeModalOverlay(); // Close modal if open

    if (redirectToLogout) {
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        ...(returnTo ? { returnTo } : {}),
      });
      const logoutUrl = `https://${this.config.domain}/v2/logout?${params.toString()}`;
      window.location.href = logoutUrl;
    }
  }

  /**
   * Stores tokens in storage.
   */
  private setTokens(tokens: StoredTokens): void {
    this.tokens = tokens;
    this.saveTokensToStorage();
  }

  /**
   * Saves tokens to storage.
   */
  private saveTokensToStorage(): void {
    if (!this.tokens || !this.config.storageKey) {
      return;
    }

    try {
      const storage =
        this.config.storageType === 'localStorage'
          ? typeof localStorage !== 'undefined'
            ? localStorage
            : null
          : typeof sessionStorage !== 'undefined'
            ? sessionStorage
            : null;

      if (storage) {
        storage.setItem(this.config.storageKey, JSON.stringify(this.tokens));
      }
    } catch (error) {
      console.warn('[Auth0Provider] Failed to save tokens to storage:', error);
    }
  }

  /**
   * Loads tokens from storage.
   */
  private loadTokensFromStorage(): void {
    if (!this.config.storageKey) {
      return;
    }

    try {
      const storage =
        this.config.storageType === 'localStorage'
          ? typeof localStorage !== 'undefined'
            ? localStorage
            : null
          : typeof sessionStorage !== 'undefined'
            ? sessionStorage
            : null;

      if (storage) {
        const stored = storage.getItem(this.config.storageKey);
        if (stored) {
          const tokens = JSON.parse(stored) as StoredTokens;
          // Check if tokens are expired
          if (tokens.expiresAt > Date.now()) {
            this.tokens = tokens;
          } else {
            // Clear expired tokens
            this.clearTokensFromStorage();
          }
        }
      }
    } catch (error) {
      console.warn('[Auth0Provider] Failed to load tokens from storage:', error);
    }
  }

  /**
   * Clears tokens from storage.
   */
  private clearTokensFromStorage(): void {
    if (!this.config.storageKey) {
      return;
    }

    try {
      const storage =
        this.config.storageType === 'localStorage'
          ? typeof localStorage !== 'undefined'
            ? localStorage
            : null
          : typeof sessionStorage !== 'undefined'
            ? sessionStorage
            : null;

      if (storage) {
        storage.removeItem(this.config.storageKey);
      }
    } catch (error) {
      console.warn('[Auth0Provider] Failed to clear tokens from storage:', error);
    }
  }

  /**
   * Saves nonce to storage for validation.
   */
  private saveNonceToStorage(nonce: string): void {
    try {
      const storage =
        this.config.storageType === 'localStorage'
          ? typeof localStorage !== 'undefined'
            ? localStorage
            : null
          : typeof sessionStorage !== 'undefined'
            ? sessionStorage
            : null;

      if (storage) {
        storage.setItem(`${this.config.storageKey}_nonce`, nonce);
      }
    } catch (error) {
      console.warn('[Auth0Provider] Failed to save nonce to storage:', error);
    }
  }

  /**
   * Validates nonce from callback against stored nonce.
   */
  private validateNonce(returnedNonce: string | null): boolean {
    if (!returnedNonce) {
      // If no nonce returned, check if we had one stored (some flows may not return it)
      // For security, we should require nonce if we sent one
      return !this.pendingNonce && !this.getNonceFromStorage();
    }

    // Check pending nonce first (in-memory)
    if (this.pendingNonce && this.pendingNonce === returnedNonce) {
      return true;
    }

    // Check stored nonce
    const storedNonce = this.getNonceFromStorage();
    if (storedNonce && storedNonce === returnedNonce) {
      return true;
    }

    return false;
  }

  /**
   * Gets nonce from storage.
   */
  private getNonceFromStorage(): string | null {
    try {
      const storage =
        this.config.storageType === 'localStorage'
          ? typeof localStorage !== 'undefined'
            ? localStorage
            : null
          : typeof sessionStorage !== 'undefined'
            ? sessionStorage
            : null;

      if (storage) {
        return storage.getItem(`${this.config.storageKey}_nonce`);
      }
    } catch (error) {
      console.warn('[Auth0Provider] Failed to get nonce from storage:', error);
    }
    return null;
  }

  /**
   * Clears nonce from storage.
   */
  private clearNonceFromStorage(): void {
    try {
      const storage =
        this.config.storageType === 'localStorage'
          ? typeof localStorage !== 'undefined'
            ? localStorage
            : null
          : typeof sessionStorage !== 'undefined'
            ? sessionStorage
            : null;

      if (storage) {
        storage.removeItem(`${this.config.storageKey}_nonce`);
      }
    } catch (error) {
      console.warn('[Auth0Provider] Failed to clear nonce from storage:', error);
    }
  }
}
