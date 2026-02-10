export type SunnyAgentMessageRole = 'user' | 'assistant' | 'system';

export interface SunnyAgentMessage {
  id: string;
  role: SunnyAgentMessageRole;
  text: string;
  createdAt: string;
  isStreaming?: boolean;
  /**
   * Raw content items returned by the platform (assistant output or user inputs).
   * These power rich UI such as MCP approvals or provider cards.
   */
  outputItems?: SunnyAgentMessageItem[];
  /**
   * Optional feedback flag recorded on the message (true=positive, false=negative).
   */
  feedback?: boolean | null;
}

export interface ConversationState {
  id: string;
  title?: string | null;
  messages: SunnyAgentMessage[];
  quickResponses?: string[];
}

export interface FileAttachment {
  filename: string;
  content: string; // base64 string
}

export interface SunnyAgentsConfig {
  websocketUrl?: string;
  /**
   * Optional WebSocket manager instance to share across multiple clients.
   * If not provided, a new LLMWebSocketManager will be created.
   * This allows sharing the same WebSocket connection between PasswordlessAuthManager
   * and SunnyAgentsClient for seamless authentication.
   */
  wsManager?: any; // LLMWebSocketManager - using any to avoid circular dependency
  /**
   * Provider function that returns an ID token for token exchange.
   * The SDK will automatically exchange this ID token for an access token.
   */
  idTokenProvider?: () => Promise<string | null>;
  sessionStorageKey?: string;
  initialConversationId?: string;
  /**
   * Whether to create/persist conversations on the server.
   * Defaults to true if an idTokenProvider is supplied, otherwise false (anonymous).
   */
  createServerConversations?: boolean;
  /**
   * Partner identifier for websocket connection (used when tokenExchange not present, e.g. anonymous mode).
   */
  partnerName?: string;
  /**
   * Token exchange configuration for converting ID tokens to access tokens.
   */
  tokenExchange?: {
    /**
     * Partner name identifier (e.g., "sunny-health-external-mock").
     * Used to construct the subject_token_type as urn:{partnerName}:id-token
     */
    partnerName: string;
    /**
     * API audience for the access token (e.g., "https://api.sunnyhealthai-staging.com").
     */
    audience: string;
    /**
     * Auth0 client ID for token exchange.
     */
    clientId: string;
    /**
     * Token exchange endpoint URL.
     * Defaults to https://auth.sunnyhealth.live/oauth/token
     */
    tokenExchangeUrl?: string;
    /**
     * Developer route/destination for token exchange.
     * If not provided, will be extracted from URL query parameters (dev-route or devRoute).
     */
    devRoute?: string;
  };
}

export interface SendMessageOptions {
  conversationId?: string;
  title?: string | null;
  files?: FileAttachment[];
  onMessageCreated?: (messageId: string) => void;
}

export interface SunnyAgentsClientSnapshot {
  conversations: ConversationState[];
  activeConversationId: string | null;
}

export interface SunnyAgentMessageContentFragment {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

export interface SunnyAgentMessageItem {
  type?: string;
  id?: string;
  name?: string;
  server_label?: string;
  arguments?: unknown;
  approval_request_id?: string;
  approve?: boolean;
  reason?: string | null;
  content?: SunnyAgentMessageContentFragment[];
  [key: string]: unknown;
}

export interface ChatArtifact<T = unknown> {
  id: string;
  item_type: string;
  item_content: T;
  content?: T;
}

export interface DoctorProfileArtifact {
  npi: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  specialty?: string;
  languages_spoken?: string[];
  gender?: string;
  rating?: number;
  review_count?: number;
  last_updated_at?: string;
  locations?: unknown;
  rank_score?: number;
  mrf_rates?: Array<Record<string, unknown>>;
  out_of_pocket_costs?: Array<{
    procedure_code: string;
    procedure_code_type?: string;
    procedure_name?: string;
    rate?: number;
    out_of_pocket: number;
  }>;
}

/**
 * Location result structure for provider search results.
 */
export interface LocationResult {
  name: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  distance_miles: number | null;
}

/**
 * Provider result structure for provider search results.
 */
export interface ProviderResult {
  npi: string;
  name: string | null;
  specialties: string[];
  degrees: string[];
  languages: string[];
  locations: LocationResult[];
}

/**
 * Provider search results artifact structure.
 * This structure is stored in the item_content field of the anonymous chat artifact
 * when created by the search_providers tool.
 */
export interface ProviderSearchResultsArtifact {
  providers: ProviderResult[];
  query: string;
  location: string;
  taxonomy_codes: string[];
  plan_name: string;
  filter_gender: string | null;
  filter_languages: string[] | null;
}

/**
 * Options for starting a passwordless login flow.
 */
export interface PasswordlessStartOptions {
  email?: string;
  phoneNumber?: string;
}

/**
 * Options for verifying a passwordless OTP code.
 */
export interface PasswordlessVerifyOptions {
  email?: string;
  phoneNumber?: string;
  code: string;
}

/**
 * Current authentication state for passwordless auth.
 * With WebSocket-based auth, tokens are managed by the backend.
 */
export interface PasswordlessAuthState {
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  expiresAt: number | null;
}

/**
 * Popup window options for Auth0 authentication.
 */
export interface Auth0PopupOptions {
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

/**
 * Configuration for Auth0 authentication provider.
 * Supports popup mode (no redirects), silent authentication, and redirect mode.
 */
export interface Auth0ProviderConfig {
  /**
   * Auth0 domain (e.g., 'your-tenant.auth0.com').
   */
  domain: string;
  /**
   * Auth0 client ID.
   */
  clientId: string;
  /**
   * Callback URL after authentication (must be configured in Auth0 dashboard).
   */
  redirectUri: string;
  /**
   * Optional connection name (e.g., 'guardian-saml').
   * If specified, users will be directed to this connection.
   */
  connection?: string;
  /**
   * Optional organization ID or name.
   * Required for Auth0 clients configured to use organizations.
   */
  organization?: string;
  /**
   * Optional API audience for access tokens.
   */
  audience?: string;
  /**
   * OAuth scopes (default: 'openid profile email').
   */
  scope?: string;
  /**
   * Use popup instead of redirect (default: true).
   * Set to false for full-page redirect mode.
   */
  usePopup?: boolean;
  /**
   * Use modal overlay instead of popup window (default: true).
   * Creates a native-feeling modal overlay with backdrop blur.
   * Only works when usePopup is true.
   */
  useModal?: boolean;
  /**
   * Popup window options (width, height, position).
   * Only used when useModal is false.
   */
  popupOptions?: Auth0PopupOptions;
  /**
   * Token storage type (default: 'sessionStorage').
   * Use 'localStorage' for persistent tokens across sessions.
   */
  storageType?: 'sessionStorage' | 'localStorage';
  /**
   * Storage key for tokens (default: 'auth0_tokens').
   */
  storageKey?: string;
}

/**
 * Theme color configuration for the chat UI.
 */
export interface VanillaChatColors {
  /** Primary color used for user messages, send button, and focus states. Default: #006fff */
  primary?: string;
  /** Secondary color used for text and UI elements. Default: #212124 */
  secondary?: string;
  /** Accent color used for success states and highlights. Default: #22c55e */
  accent?: string;
}

/**
 * SAML/OIDC authentication configuration via Auth0.
 * Auth0 handles token exchange via standard OAuth flow.
 * This triggers automatic authentication on initialization.
 */
export interface SamlOidcAuthConfig {
  type: 'saml' | 'oidc';
  /**
   * Auth0 domain (e.g., 'your-tenant.auth0.com').
   */
  domain: string;
  /**
   * Auth0 client ID.
   */
  clientId: string;
  /**
   * SAML/OIDC connection name - triggers auto-login when provided.
   * If specified, users will be automatically authenticated via SAML or OIDC.
   */
  connection: string;
  /**
   * Optional organization ID or name.
   * Required for Auth0 clients configured to use organizations.
   */
  organization?: string;
  /**
   * API audience for access tokens.
   */
  audience?: string;
  /**
   * Callback URL after authentication (must be configured in Auth0 dashboard).
   * Defaults to current origin + '/callback.html'.
   */
  redirectUri?: string;
  /**
   * Use popup instead of redirect (default: true).
   * Set to false for full-page redirect mode.
   */
  usePopup?: boolean;
  /**
   * Use modal overlay instead of popup window (default: true).
   * Creates a native-feeling modal overlay with backdrop blur.
   * Only works when usePopup is true.
   */
  useModal?: boolean;
  /**
   * Token storage type (default: 'sessionStorage').
   * Use 'localStorage' for persistent tokens across sessions.
   */
  storageType?: 'sessionStorage' | 'localStorage';
}

/**
 * Custom token exchange authentication configuration.
 * For custom JWT token exchange flows (not SAML/OIDC).
 */
export interface TokenExchangeAuthConfig {
  type: 'tokenExchange';
  /**
   * Provider function that returns an ID token for token exchange.
   * This function will be called to get the ID token that will be exchanged for an access token.
   */
  idTokenProvider: () => Promise<string | null>;
  /**
   * Partner name identifier (e.g., "sunny-health-external-mock").
   * Used to construct the subject_token_type as urn:{partnerName}:id-token
   */
  partnerName: string;
  /**
   * API audience for the access token (e.g., "https://api.sunnyhealthai-staging.com").
   */
  audience: string;
  /**
   * Auth0 client ID for token exchange.
   */
  clientId: string;
  /**
   * Token exchange endpoint URL.
   * Defaults to https://auth.sunnyhealth.live/oauth/token
   */
  tokenExchangeUrl?: string;
  /**
   * Developer route/destination for token exchange.
   * If not provided, will be extracted from URL query parameters (dev-route or devRoute).
   */
  devRoute?: string;
}

/**
 * Authentication configuration - either SAML/OIDC via Auth0 or custom token exchange.
 * These are mutually exclusive - provide exactly one.
 */
export type AuthConfig = SamlOidcAuthConfig | TokenExchangeAuthConfig;

/**
 * Unified configuration options for createSunnyChat().
 * Simplifies setup by automatically handling authentication and initialization.
 */
export interface UnifiedSunnyChatOptions {
  container: HTMLElement;
  websocketUrl?: string;
  /**
   * Partner identifier for websocket (e.g., used in anonymous mode).
   */
  partnerName?: string;
  /**
   * Authentication configuration.
   * Provide either SAML/OIDC authentication via Auth0 or custom token exchange.
   * If omitted, chat will run in anonymous mode.
   */
  auth?: AuthConfig;
  /**
   * UI options
   */
  headerTitle?: string;
  placeholder?: string;
  colors?: VanillaChatColors;
  /**
   * Enable anonymous mode explicitly.
   * Defaults to true if no auth config is provided, otherwise false.
   */
  anonymous?: boolean;
}

