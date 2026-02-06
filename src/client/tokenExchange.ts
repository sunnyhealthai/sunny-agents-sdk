export interface TokenExchangeConfig {
  partnerName: string;
  audience: string;
  clientId: string;
  tokenExchangeUrl?: string;
  devRoute?: string;
}

export interface TokenExchangeResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  issued_token_type?: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const DEFAULT_TOKEN_EXCHANGE_URL = 'https://auth.sunnyhealth.live/oauth/token';

/**
 * Exchanges an ID token for an access token using the token exchange endpoint.
 */
export async function exchangeIdTokenForAccessToken(
  idToken: string,
  config: TokenExchangeConfig
): Promise<TokenExchangeResponse> {
  const tokenExchangeUrl = config.tokenExchangeUrl || DEFAULT_TOKEN_EXCHANGE_URL;
  const subjectTokenType = `urn:${config.partnerName}:id-token`;

  // Extract dev-route from query parameters if not provided in config
  let developerDestination = config.devRoute || null;
  if (!developerDestination && typeof window !== 'undefined' && window.location) {
    try {
      const queryParams = new URLSearchParams(window.location.search);
      developerDestination = queryParams.get('dev-route') || queryParams.get('devRoute') || null;
      if (developerDestination) {
        console.log(`[TokenExchange] Found dev-route in query params: ${developerDestination}`);
      }
    } catch (e) {
      console.log('[TokenExchange] Could not parse query params:', e);
    }
  }

  console.log('[TokenExchange] Starting token exchange', {
    tokenExchangeUrl,
    partnerName: config.partnerName,
    audience: config.audience,
    clientId: config.clientId,
    subjectTokenType,
    devRoute: developerDestination,
    idTokenLength: idToken.length,
  });

  const formData = new URLSearchParams();
  formData.append('grant_type', 'urn:ietf:params:oauth:grant-type:token-exchange');
  formData.append('client_id', config.clientId);
  formData.append('audience', config.audience);
  formData.append('subject_token_type', subjectTokenType);
  formData.append('subject_token', idToken);
  
  // Add dev-route to request body if available
  if (developerDestination) {
    formData.append('dev-route', developerDestination);
  }

  const requestStartTime = Date.now();
  const response = await fetch(tokenExchangeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  const requestDuration = Date.now() - requestStartTime;

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[TokenExchange] Token exchange failed', {
      status: response.status,
      statusText: response.statusText,
      errorText,
      requestDuration,
    });
    throw new Error(
      `Token exchange failed: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  const responseData = (await response.json()) as TokenExchangeResponse;
  console.log('[TokenExchange] Token exchange successful', {
    tokenType: responseData.token_type,
    expiresIn: responseData.expires_in,
    issuedTokenType: responseData.issued_token_type,
    accessTokenLength: responseData.access_token.length,
    requestDuration,
  });

  return responseData;
}

/**
 * Token exchange manager that handles caching and automatic refresh.
 */
export class TokenExchangeManager {
  private cachedToken: CachedToken | null = null;
  private exchangePromise: Promise<string> | null = null;

  constructor(
    private readonly idTokenProvider: () => Promise<string | null | undefined>,
    private readonly config: TokenExchangeConfig
  ) {}

  /**
   * Gets a valid access token, exchanging the ID token if necessary.
   * Caches the access token and automatically refreshes when expired.
   */
  async getAccessToken(): Promise<string | null> {
    console.log('[TokenExchangeManager] getAccessToken called');

    // If there's already an exchange in progress, wait for it
    if (this.exchangePromise) {
      console.log('[TokenExchangeManager] Token exchange already in progress, waiting...');
      return this.exchangePromise;
    }

    // Check if cached token is still valid (with 60 second buffer)
    const now = Date.now();
    const bufferMs = 60000;
    if (this.cachedToken && this.cachedToken.expiresAt > now + bufferMs) {
      const timeUntilExpiry = this.cachedToken.expiresAt - now;
      console.log('[TokenExchangeManager] Using cached token', {
        expiresAt: new Date(this.cachedToken.expiresAt).toISOString(),
        timeUntilExpiryMs: timeUntilExpiry,
        timeUntilExpiryMinutes: Math.round(timeUntilExpiry / 60000),
      });
      return this.cachedToken.accessToken;
    }

    if (this.cachedToken) {
      const timeUntilExpiry = this.cachedToken.expiresAt - now;
      console.log('[TokenExchangeManager] Cached token expired or expiring soon, refreshing', {
        expiresAt: new Date(this.cachedToken.expiresAt).toISOString(),
        timeUntilExpiryMs: timeUntilExpiry,
        timeUntilExpiryMinutes: Math.round(timeUntilExpiry / 60000),
      });
    } else {
      console.log('[TokenExchangeManager] No cached token, performing new exchange');
    }

    // Get ID token from provider
    console.log('[TokenExchangeManager] Requesting ID token from provider');
    const idToken = await this.idTokenProvider();
    if (!idToken) {
      console.warn('[TokenExchangeManager] ID token provider returned null/undefined');
      this.cachedToken = null;
      return null;
    }

    console.log('[TokenExchangeManager] ID token received', {
    length: idToken.length,
    // Show first/last few chars to help identify the token (but not the full token for security)
    prefix: idToken.substring(0, 20) + '...',
    suffix: '...' + idToken.substring(idToken.length - 20),
    // Check if it looks like a JWT (has 3 parts separated by dots)
    isJWT: idToken.split('.').length === 3,
  });

    // Perform token exchange
    this.exchangePromise = (async () => {
      try {
        console.log('[TokenExchangeManager] Starting token exchange process');
        const response = await exchangeIdTokenForAccessToken(idToken, this.config);
        
        // Cache the access token
        const expiresAt = Date.now() + response.expires_in * 1000;
        this.cachedToken = {
          accessToken: response.access_token,
          expiresAt,
        };

        console.log('[TokenExchangeManager] Token exchange completed and cached', {
          expiresAt: new Date(expiresAt).toISOString(),
          expiresInSeconds: response.expires_in,
        });

        return response.access_token;
      } catch (error) {
        console.error('[TokenExchangeManager] Token exchange failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        // Clear cache on error
        this.cachedToken = null;
        throw error;
      } finally {
        this.exchangePromise = null;
        console.log('[TokenExchangeManager] Token exchange promise cleared');
      }
    })();

    return this.exchangePromise;
  }

  /**
   * Clears the cached access token, forcing a fresh exchange on next call.
   */
  clearCache(): void {
    console.log('[TokenExchangeManager] Clearing cached token');
    this.cachedToken = null;
  }
}
