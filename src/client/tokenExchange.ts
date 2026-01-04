export interface TokenExchangeConfig {
  partnerName: string;
  audience: string;
  clientId: string;
  tokenExchangeUrl?: string;
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

  const formData = new URLSearchParams();
  formData.append('grant_type', 'urn:ietf:params:oauth:grant-type:token-exchange');
  formData.append('client_id', config.clientId);
  formData.append('audience', config.audience);
  formData.append('subject_token_type', subjectTokenType);
  formData.append('subject_token', idToken);

  const response = await fetch(tokenExchangeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Token exchange failed: ${response.status} ${response.statusText}. ${errorText}`
    );
  }

  return (await response.json()) as TokenExchangeResponse;
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
    // If there's already an exchange in progress, wait for it
    if (this.exchangePromise) {
      return this.exchangePromise;
    }

    // Check if cached token is still valid (with 60 second buffer)
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60000) {
      return this.cachedToken.accessToken;
    }

    // Get ID token from provider
    const idToken = await this.idTokenProvider();
    if (!idToken) {
      this.cachedToken = null;
      return null;
    }

    // Perform token exchange
    this.exchangePromise = (async () => {
      try {
        const response = await exchangeIdTokenForAccessToken(idToken, this.config);
        
        // Cache the access token
        const expiresAt = Date.now() + response.expires_in * 1000;
        this.cachedToken = {
          accessToken: response.access_token,
          expiresAt,
        };

        return response.access_token;
      } catch (error) {
        // Clear cache on error
        this.cachedToken = null;
        throw error;
      } finally {
        this.exchangePromise = null;
      }
    })();

    return this.exchangePromise;
  }

  /**
   * Clears the cached access token, forcing a fresh exchange on next call.
   */
  clearCache(): void {
    this.cachedToken = null;
  }
}
