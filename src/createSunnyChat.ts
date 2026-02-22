import { Auth0Provider } from './client/auth0Provider';
import { LLMWebSocketManager } from './client/llmWebSocket';
import { PasswordlessAuthManager } from './client/passwordlessAuth';
import { attachSunnyChat, type VanillaChatInstance } from './ui/vanillaChat';
import type {
  AuthUpgradeProfileSyncData,
  SdkAuthConfig,
  SdkAuthType,
  SunnyAgentsConfig,
  UnifiedSunnyChatOptions,
} from './types';

type ProfileSyncInput = AuthUpgradeProfileSyncData | (() => Promise<AuthUpgradeProfileSyncData | null>);

/**
 * Fetch SDK configuration from the dedicated HTTP endpoint.
 * Derives the HTTP URL from the WebSocket URL automatically.
 */
async function fetchSdkConfig(options: {
  websocketUrl?: string;
  publicKey: string;
  partnerIdentifier: string;
}): Promise<SdkAuthConfig> {
  const baseUrl = options.websocketUrl ?? 'wss://chat.api.sunnyhealthai-staging.com';
  const httpUrl = baseUrl
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://');

  const url = new URL('/sdk/config', httpUrl);
  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'x-sunny-partner-identifier': options.partnerIdentifier,
      'x-sunny-api-key': options.publicKey,
    },
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errorBody = await response.json();
      errorMessage = errorBody.error?.message ?? errorMessage;
    } catch { /* use statusText */ }
    throw new Error(`[createSunnyChat] SDK config fetch failed: ${errorMessage}`);
  }

  const data = await response.json();
  return data.config as SdkAuthConfig;
}

/**
 * Activate an auth type using server-provided config.
 * Shared between initialization and runtime switching (setAuthType).
 *
 * Returns the PasswordlessAuthManager if the auth type is 'passwordless', or null otherwise.
 */
async function activateAuthType(
  authType: SdkAuthType,
  serverConfig: SdkAuthConfig,
  wsManager: LLMWebSocketManager,
  partnerIdentifier: string,
  idTokenProvider?: () => Promise<string | null>,
  devRoute?: string,
  authUpgradeProfileSync?: ProfileSyncInput,
): Promise<{ passwordlessAuth?: PasswordlessAuthManager }> {
  switch (authType) {
    case 'passwordless': {
      // Create PasswordlessAuthManager using the shared wsManager
      const passwordlessAuth = new PasswordlessAuthManager({
        wsManager,
        migrateHistory: true,
        storageType: 'sessionStorage',
      });
      return { passwordlessAuth };
    }

    case 'saml':
    case 'oidc': {
      // Create Auth0Provider with server-provided config and trigger auth popup
      if (!serverConfig.auth0_domain || !serverConfig.auth0_client_id) {
        console.warn(`[createSunnyChat] Server config missing auth0_domain or auth0_client_id for ${authType} auth`);
        return {};
      }

      const redirectUri = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '')}/callback.html`;
      const auth0Provider = new Auth0Provider({
        domain: serverConfig.auth0_domain,
        clientId: serverConfig.auth0_client_id,
        redirectUri,
        connection: serverConfig.auth0_connection,
        organization: serverConfig.organization,
        audience: serverConfig.audience,
        usePopup: true,
        useModal: true,
        storageType: 'sessionStorage',
        storageKey: 'auth0_saml_tokens',
      });

      // Handle callback if returning from redirect
      if (window.location.search.includes('code=') || window.location.hash.includes('access_token')) {
        try {
          await auth0Provider.handleCallback();
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.warn('[createSunnyChat] Failed to handle Auth0 callback:', error);
        }
      }

      // Try to authenticate automatically
      if (!auth0Provider.isAuthenticated()) {
        try {
          await auth0Provider.checkSession();
        } catch {
          try {
            await auth0Provider.authorizePopup();
          } catch (popupError) {
            console.warn(`[createSunnyChat] Auth0 ${authType} authentication failed:`, popupError);
          }
        }
      }

      // Store the ID token for deferred auth upgrade (happens on first message)
      if (auth0Provider.isAuthenticated()) {
        const idToken = auth0Provider.getIdToken();
        if (idToken) {
          wsManager.setTokenProvider(async () => idToken);
        }
      }
      return {};
    }

    case 'tokenExchange': {
      if (!idTokenProvider) {
        throw new Error('[createSunnyChat] idTokenProvider is required when authType is "tokenExchange"');
      }

      // Configure token exchange on the wsManager (auth upgrade deferred to first message)
      wsManager.configureTokenExchange(idTokenProvider, {
        partnerName: partnerIdentifier,
        audience: serverConfig.audience ?? '',
        clientId: serverConfig.auth0_client_id ?? '',
        organization: serverConfig.organization ?? '',
        tokenExchangeUrl: serverConfig.token_exchange_url,
        devRoute,
      });
      return {};
    }

    default:
      throw new Error(`[createSunnyChat] Unknown authType: ${authType}`);
  }
}

/**
 * Unified entry point for creating a Sunny Chat instance.
 *
 * Three required parameters: partnerIdentifier, publicKey, authType.
 * All auth configuration (Auth0 domain, client ID, connection, etc.)
 * is fetched from the server via the HTTP POST /sdk/config endpoint.
 * The WebSocket connection is deferred until the user sends a message.
 *
 * @example
 * ```ts
 * // Passwordless (starts anonymous, user verifies via email/SMS)
 * const chat = await createSunnyChat({
 *   container: document.getElementById('chat'),
 *   partnerIdentifier: 'acme-health',
 *   publicKey: 'pk-sunnyagents_abc_xyz',
 *   authType: 'passwordless',
 * });
 * ```
 *
 * @example
 * ```ts
 * // SAML (triggers auto-login popup)
 * const chat = await createSunnyChat({
 *   container: document.getElementById('chat'),
 *   partnerIdentifier: 'acme-health',
 *   publicKey: 'pk-sunnyagents_abc_xyz',
 *   authType: 'saml',
 * });
 * ```
 *
 * @example
 * ```ts
 * // Token exchange
 * const chat = await createSunnyChat({
 *   container: document.getElementById('chat'),
 *   partnerIdentifier: 'acme-health',
 *   publicKey: 'pk-sunnyagents_abc_xyz',
 *   authType: 'tokenExchange',
 *   idTokenProvider: async () => getMyUserToken(),
 * });
 * ```
 *
 * @example
 * ```ts
 * // Switch auth type at runtime
 * chat.setAuthType('saml');
 * ```
 */
export async function createSunnyChat(options: UnifiedSunnyChatOptions): Promise<VanillaChatInstance> {
  // --- Validate required options ---
  if (!options.partnerIdentifier) {
    throw new Error('[createSunnyChat] partnerIdentifier is required');
  }
  if (!options.publicKey) {
    throw new Error('[createSunnyChat] publicKey is required');
  }
  if (!options.authType) {
    throw new Error('[createSunnyChat] authType is required (one of: passwordless, saml, oidc, tokenExchange)');
  }
  const validAuthTypes: SdkAuthType[] = ['passwordless', 'saml', 'oidc', 'tokenExchange'];
  if (!validAuthTypes.includes(options.authType)) {
    throw new Error(`[createSunnyChat] Invalid authType "${options.authType}". Must be one of: ${validAuthTypes.join(', ')}`);
  }
  if (options.authType === 'tokenExchange' && !options.idTokenProvider) {
    throw new Error('[createSunnyChat] idTokenProvider is required when authType is "tokenExchange"');
  }

  // --- Create WebSocket manager ---
  const wsManager: LLMWebSocketManager = options.wsManager ?? new LLMWebSocketManager({
    websocketUrl: options.websocketUrl,
    partnerName: options.partnerIdentifier,
    publicKey: options.publicKey,
  });

  // --- Fetch SDK config via HTTP (no WebSocket connection yet) ---
  const serverConfig = await fetchSdkConfig({
    websocketUrl: options.websocketUrl,
    publicKey: options.publicKey,
    partnerIdentifier: options.partnerIdentifier,
  });
  console.log('[createSunnyChat] SDK config fetched via HTTP:', serverConfig);

  // --- Activate auth type ---
  const { passwordlessAuth } = await activateAuthType(
    options.authType,
    serverConfig,
    wsManager,
    options.partnerIdentifier,
    options.idTokenProvider,
    options.devRoute,
    options.authUpgradeProfileSync,
  );

  // --- Build SunnyAgentsConfig for the chat client ---
  const config: SunnyAgentsConfig = {
    websocketUrl: options.websocketUrl,
    partnerName: options.partnerIdentifier,
    publicKey: options.publicKey,
    wsManager,
    createServerConversations: false,
    authUpgradeProfileSync: options.authUpgradeProfileSync,
  };

  // --- Create chat instance ---
  const chatInstance = attachSunnyChat({
    container: options.container,
    config,
    headerTitle: options.headerTitle,
    placeholder: options.placeholder,
    colors: options.colors,
    fontSize: options.fontSize,
    fontFamily: options.fontFamily,
    dimensions: options.dimensions,
    anonymous: options.authType === 'passwordless',
    passwordlessAuth,
  });

  // --- Attach setAuthType for runtime switching ---
  const instance = chatInstance as VanillaChatInstance & {
    setAuthType: (
      authType: SdkAuthType,
      opts?: {
        idTokenProvider?: () => Promise<string | null>;
        authUpgradeProfileSync?: ProfileSyncInput;
      },
    ) => Promise<void>;
  };

  instance.setAuthType = async (
    newAuthType: SdkAuthType,
    opts?: {
      idTokenProvider?: () => Promise<string | null>;
      authUpgradeProfileSync?: ProfileSyncInput;
    },
  ) => {
    if (newAuthType === 'tokenExchange' && !opts?.idTokenProvider && !options.idTokenProvider) {
      throw new Error('[setAuthType] idTokenProvider is required when switching to tokenExchange');
    }
    await activateAuthType(
      newAuthType,
      serverConfig,
      wsManager,
      options.partnerIdentifier,
      opts?.idTokenProvider ?? options.idTokenProvider,
      options.devRoute,
      opts?.authUpgradeProfileSync ?? options.authUpgradeProfileSync,
    );

    // Update conversation creation mode based on new auth state
    instance.client.setCreateServerConversations(wsManager.getIsAuthenticated());
  };

  return instance;
}
