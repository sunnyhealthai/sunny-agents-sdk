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
   * Defaults to true if an idTokenProvider is supplied, otherwise false.
   */
  createServerConversations?: boolean;
  /**
   * Partner identifier for websocket connection.
   */
  partnerName?: string;
  /**
   * Public API key for SDK session creation.
   */
  publicKey?: string;
  /**
   * Token exchange configuration for converting ID tokens to access tokens.
   */
  tokenExchange?: {
    partnerName: string;
    audience: string;
    clientId: string;
    organization: string;
    tokenExchangeUrl?: string;
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
 * Auth types the developer must choose from.
 * - passwordless: starts unauthenticated, user can verify via email/SMS
 * - saml: triggers SAML auto-login popup on init
 * - oidc: triggers OIDC auto-login popup on init
 * - tokenExchange: uses a partner-provided ID token to authenticate
 */
export type SdkAuthType = 'passwordless' | 'saml' | 'oidc' | 'tokenExchange';

/**
 * Server-provided auth configuration (returned by sdk.session.created).
 * Contains only public fields -- no secrets.
 */
export interface SdkAuthConfig {
  auth0_domain?: string;
  auth0_client_id?: string;
  auth0_connection?: string;
  audience?: string;
  organization?: string;
  token_exchange_url?: string;
}

/**
 * Unified configuration options for createSunnyChat().
 * Three required parameters: partnerIdentifier, publicKey, authType.
 * All auth configuration details come from the server.
 */
export interface UnifiedSunnyChatOptions {
  /** Container element for the chat UI. */
  container: HTMLElement;
  /** Partner identifier (required). */
  partnerIdentifier: string;
  /** Public API key (required, e.g. "pk-sunnyagents_..."). */
  publicKey: string;
  /** Auth type (required). Developer must choose one. */
  authType: SdkAuthType;
  /** Required when authType is 'tokenExchange'. */
  idTokenProvider?: () => Promise<string | null>;

  // --- Development / customization options ---
  /** Override WebSocket URL (default: wss://chat.api.sunnyhealthai-staging.com). */
  websocketUrl?: string;
  /** Share a WebSocket manager across instances. */
  wsManager?: any; // LLMWebSocketManager - using any to avoid circular dependency
  /**
   * Developer route/destination for token exchange.
   * If not provided, will be auto-extracted from URL query parameters (?dev-route=...).
   */
  devRoute?: string;
  /** Chat header title. Default: "Sunny Agents". */
  headerTitle?: string;
  /** Input placeholder text. Default: "Ask anything...". */
  placeholder?: string;
  /** Theme colors. */
  colors?: VanillaChatColors;
}

