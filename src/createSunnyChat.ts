import { LLMWebSocketManager } from './client/llmWebSocket';
import { PasswordlessAuthManager } from './client/passwordlessAuth';
import { attachSunnyChat, type VanillaChatInstance } from './ui/vanillaChat';
import type {
  SdkAuthConfig,
  SdkAuthType,
  SunnyAgentsConfig,
  UnifiedSunnyChatOptions,
} from './types';

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
 * is fetched from the server via the HTTP GET /sdk/config endpoint.
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
 * chat.setAuthType('tokenExchange');
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
    throw new Error('[createSunnyChat] authType is required (one of: passwordless, tokenExchange)');
  }
  const validAuthTypes: SdkAuthType[] = ['passwordless', 'tokenExchange'];
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
  );

  // --- Build SunnyAgentsConfig for the chat client ---
  const config: SunnyAgentsConfig = {
    websocketUrl: options.websocketUrl,
    partnerName: options.partnerIdentifier,
    publicKey: options.publicKey,
    wsManager,
    createServerConversations: options.authType === 'tokenExchange',
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
      },
    ) => Promise<void>;
  };

  instance.setAuthType = async (
    newAuthType: SdkAuthType,
    opts?: {
      idTokenProvider?: () => Promise<string | null>;
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
    );

    // Update conversation creation mode based on new auth state
    instance.client.setCreateServerConversations(wsManager.getIsAuthenticated());
  };

  return instance;
}
