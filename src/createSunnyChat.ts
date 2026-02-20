import { Auth0Provider } from './client/auth0Provider';
import { LLMWebSocketManager } from './client/llmWebSocket';
import { PasswordlessAuthManager } from './client/passwordlessAuth';
import { attachSunnyChat, type VanillaChatInstance } from './ui/vanillaChat';
import type { UnifiedSunnyChatOptions, SunnyAgentsConfig, SdkAuthType, SdkAuthConfig } from './types';

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

      // If authenticated, upgrade the websocket connection
      if (auth0Provider.isAuthenticated()) {
        const idToken = auth0Provider.getIdToken();
        if (idToken) {
          await wsManager.upgradeAuth(idToken, true).catch((err: unknown) => {
            console.warn('[createSunnyChat] Auth upgrade failed:', err);
          });
        }
      }
      return {};
    }

    case 'tokenExchange': {
      if (!idTokenProvider) {
        throw new Error('[createSunnyChat] idTokenProvider is required when authType is "tokenExchange"');
      }

      // Configure token exchange on the wsManager using server config
      wsManager.configureTokenExchange(idTokenProvider, {
        partnerName: partnerIdentifier,
        audience: serverConfig.audience ?? '',
        clientId: serverConfig.auth0_client_id ?? '',
        organization: serverConfig.organization ?? '',
        tokenExchangeUrl: serverConfig.token_exchange_url,
        devRoute,
      });

      // Attempt auth upgrade
      await wsManager.upgradeAuthIfPossible(true).catch((err: unknown) => {
        console.warn('[createSunnyChat] Token exchange auth upgrade failed, continuing as anonymous:', err);
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
 * comes from the server via sdk.session.create.
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

  // --- Connect and wait for SDK session config ---
  await wsManager.connect();
  const serverConfig = await wsManager.waitForSdkSession();
  console.log('[createSunnyChat] SDK session established, server config:', serverConfig);

  // --- Activate auth type ---
  const { passwordlessAuth } = await activateAuthType(
    options.authType,
    serverConfig,
    wsManager,
    options.partnerIdentifier,
    options.idTokenProvider,
    options.devRoute,
  );

  // --- Build SunnyAgentsConfig for the chat client ---
  const config: SunnyAgentsConfig = {
    websocketUrl: options.websocketUrl,
    partnerName: options.partnerIdentifier,
    publicKey: options.publicKey,
    wsManager,
    createServerConversations: wsManager.getIsAuthenticated(),
  };

  // --- Create chat instance ---
  const chatInstance = attachSunnyChat({
    container: options.container,
    config,
    headerTitle: options.headerTitle,
    placeholder: options.placeholder,
    colors: options.colors,
    startMessage: options.startMessage,
    anonymous: options.authType === 'passwordless',
    passwordlessAuth,
  });

  // --- Attach setAuthType for runtime switching ---
  const instance = chatInstance as VanillaChatInstance & {
    setAuthType: (authType: SdkAuthType, opts?: { idTokenProvider?: () => Promise<string | null> }) => Promise<void>;
  };

  instance.setAuthType = async (
    newAuthType: SdkAuthType,
    opts?: { idTokenProvider?: () => Promise<string | null> },
  ) => {
    const cachedConfig = wsManager.getSdkAuthConfig();
    if (!cachedConfig) {
      throw new Error('[setAuthType] SDK session config not available. Was createSunnyChat used?');
    }
    if (newAuthType === 'tokenExchange' && !opts?.idTokenProvider && !options.idTokenProvider) {
      throw new Error('[setAuthType] idTokenProvider is required when switching to tokenExchange');
    }
    await activateAuthType(
      newAuthType,
      cachedConfig,
      wsManager,
      options.partnerIdentifier,
      opts?.idTokenProvider ?? options.idTokenProvider,
      options.devRoute,
    );

    // Update conversation creation mode based on new auth state
    instance.client.setCreateServerConversations(wsManager.getIsAuthenticated());
  };

  return instance;
}
