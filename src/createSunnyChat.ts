import { Auth0Provider } from './client/auth0Provider';
import { attachSunnyChat, type VanillaChatInstance } from './ui/vanillaChat';
import type { UnifiedSunnyChatOptions, SunnyAgentsConfig, AuthConfig, SamlOidcAuthConfig, TokenExchangeAuthConfig } from './types';

/**
 * Unified entry point for creating a Sunny Chat instance with automatic authentication.
 * 
 * This function simplifies setup by automatically handling:
 * - SAML/OIDC authentication via Auth0 (when auth.type is 'saml' or 'oidc')
 * - Custom token exchange (when auth.type is 'tokenExchange')
 * - Anonymous mode (when auth is not provided)
 * 
 * @example
 * ```ts
 * // SAML authentication (auto-login)
 * const chat = await createSunnyChat({
 *   container: document.getElementById('chat'),
 *   auth: {
 *     type: 'saml',
 *     domain: 'your-tenant.auth0.com',
 *     clientId: 'your-client-id',
 *     connection: 'guardian-saml', // Auto-login enabled
 *     audience: 'https://api.sunnyhealthai-staging.com',
 *   },
 * });
 * ```
 * 
 * @example
 * ```ts
 * // Custom token exchange
 * const chat = await createSunnyChat({
 *   container: document.getElementById('chat'),
 *   auth: {
 *     type: 'tokenExchange',
 *     idTokenProvider: async () => localStorage.getItem('id_token'),
 *     partnerName: 'your-partner-name',
 *     audience: 'https://api.sunnyhealthai-staging.com',
 *     clientId: 'your-client-id',
 *     organization: 'your-organization-id',
 *   },
 * });
 * ```
 *
 * @example
 * ```ts
 * // Anonymous chat with partner identifier
 * const chat = await createSunnyChat({
 *   container: document.getElementById('chat'),
 *   partnerName: 'your-partner-name',
 * });
 * ```
 */
export async function createSunnyChat(options: UnifiedSunnyChatOptions): Promise<VanillaChatInstance> {
  let auth0Provider: Auth0Provider | null = null;
  let idTokenProvider: (() => Promise<string | null>) | undefined = undefined;
  let tokenExchange: SunnyAgentsConfig['tokenExchange'] = undefined;

  // Handle authentication based on type
  if (options.auth) {
    if (options.auth.type === 'saml' || options.auth.type === 'oidc') {
      // Handle SAML/OIDC Auth0 flow
      const authConfig = options.auth as SamlOidcAuthConfig;
      const redirectUri = authConfig.redirectUri ||
        `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}/callback.html`;

      auth0Provider = new Auth0Provider({
        domain: authConfig.domain,
        clientId: authConfig.clientId,
        redirectUri,
        connection: authConfig.connection,
        organization: authConfig.organization,
        audience: authConfig.audience,
        usePopup: authConfig.usePopup ?? true,
        useModal: authConfig.useModal ?? true,
        storageType: authConfig.storageType ?? 'sessionStorage',
        storageKey: 'auth0_saml_tokens',
      });

      // Handle callback if returning from redirect
      if (window.location.search.includes('code=') || window.location.hash.includes('access_token')) {
        try {
          await auth0Provider.handleCallback();
          // Clear URL hash/query params
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.warn('[createSunnyChat] Failed to handle Auth0 callback:', error);
          // Continue with authentication attempt
        }
      }

      // Try to authenticate automatically
      if (!auth0Provider.isAuthenticated()) {
        try {
          // Note: checkSession() currently throws, so we skip it and go straight to popup
          // Try silent auth if available (may throw)
          await auth0Provider.checkSession();
        } catch (error) {
          // Silent auth not available or failed - trigger popup/modal auth
          try {
            await auth0Provider.authorizePopup();
          } catch (popupError) {
            console.warn('[createSunnyChat] Auth0 popup authentication failed:', popupError);
            // Continue with anonymous mode if auth fails
          }
        }
      }

      // Set up idTokenProvider from Auth0
      if (auth0Provider.isAuthenticated()) {
        idTokenProvider = () => Promise.resolve(auth0Provider!.getIdToken());
      } else {
        console.warn('[createSunnyChat] Auth0 authentication failed, continuing in anonymous mode');
      }
      // Note: SAML/OIDC uses Auth0's OAuth flow, so no tokenExchange config needed
    } else if (options.auth.type === 'tokenExchange') {
      // Handle custom token exchange flow
      const authConfig = options.auth as TokenExchangeAuthConfig;
      idTokenProvider = authConfig.idTokenProvider;
      tokenExchange = {
        partnerName: authConfig.partnerName,
        audience: authConfig.audience,
        clientId: authConfig.clientId,
        organization: authConfig.organization,
        tokenExchangeUrl: authConfig.tokenExchangeUrl,
        devRoute: authConfig.devRoute,
      };
    }
  }

  // Build SunnyAgentsConfig
  const config: SunnyAgentsConfig = {
    websocketUrl: options.websocketUrl,
    partnerName: options.partnerName ?? tokenExchange?.partnerName,
    idTokenProvider,
    tokenExchange,
  };

  // Determine if anonymous mode
  const anonymous = options.anonymous ?? (!options.auth);

  // Create chat instance
  const chatInstance = attachSunnyChat({
    container: options.container,
    config,
    headerTitle: options.headerTitle,
    placeholder: options.placeholder,
    colors: options.colors,
    anonymous,
  });

  return chatInstance;
}
