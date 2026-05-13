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
  /** Stable in-memory conversation id for this client instance; survives WebSocket reconnect (new server session). */
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
  /**
   * Optional profile-sync data to send with auth.upgrade (user_profile, user_address, insurances, dependents).
   * Can be static data or an async provider resolved at auth time.
   */
  authUpgradeProfileSync?: AuthUpgradeProfileSyncData | (() => Promise<AuthUpgradeProfileSyncData | null>);
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
 * when created by the legacy `search_providers` tool (mcp-external pre-PR-469)
 * and the asksunny `search_providers_by_specialty_with_cost` tool.
 *
 * **Status:** retained for asksunny / consumer chat. mcp-external no longer
 * emits this shape — see {@link LocationSearchResultsArtifact} and friends
 * below for the location-grouped equivalents.
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

// ===========================================================================
// Location-grouped search artifacts (mcp-external location-centric tools).
//
// Emitted by the four mcp-external search tools introduced in PR
// sunnyhealthai/monorepo#469:
//   - `search_providers_by_specialty`  → location_search_results
//   - `search_locations_by_name`        → location_search_results
//   - `find_provider_by_name`           → provider_name_search_results
//   - `get_location_providers`          → location_detail
//
// All four return one entry per `location_uuid` with the matched providers
// attached underneath. Location-level fields (address, phone, geo) are
// hoisted onto the group so renderers don't have to dig into providers[0].
// ===========================================================================

/**
 * One provider entry inside a {@link LocationGroup}. The `point_id` is the
 * Qdrant point identifier and is the value to pass back to
 * `schedule_appointment` on the booking step.
 */
export interface NestedProvider {
  npi: string;
  point_id: string;
  first_name: string | null;
  last_name: string | null;
  specialties: string[];
  degrees: string[];
  languages: string[];
  /** "M" / "F" / "U" or null when unknown. */
  gender: string | null;
  is_pcp: boolean | null;
}

/**
 * One location group: the office plus the providers (matching the search
 * filter) at it. Returned inside every grouped-search artifact below.
 */
export interface LocationGroup {
  /** Group key — pass this back to `get_location_providers` for a drill-down. */
  location_uuid: string;
  location_name: string | null;
  address: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  primary_phone: string | null;
  /** Distance from the search center, when a geo radius was used. */
  distance_miles: number | null;
  /**
   * Providers that matched the filter at this location, in the order
   * Qdrant returned them. May be smaller than the location's true roster
   * when the request used a provider-level filter (specialty / name) —
   * call `get_location_providers` for the complete list.
   */
  providers: NestedProvider[];
}

/**
 * Body of a `location_search_results` artifact. Returned by both
 * `search_providers_by_specialty` and `search_locations_by_name` — the
 * input echoes vary, but the location-group shape is shared.
 */
export interface LocationSearchResultsArtifact {
  locations: LocationGroup[];
  /** LLM-supplied medical intent (verbatim) — kept for traceability. */
  query: string;
  /** Geocoded address string the user provided. */
  location: string;
  /** Taxonomy codes used as a filter, if any. Empty for `search_locations_by_name`. */
  taxonomy_codes: string[];
  /** Practice-name fragment used as a filter, if any. Populated only by `search_locations_by_name`. */
  location_name_query: string | null;
  plan_id: string;
  filter_gender: string | null;
  filter_languages: string[] | null;
  radius_miles: number;
  total_locations: number;
}

/**
 * Body of a `provider_name_search_results` artifact. Returned by
 * `find_provider_by_name`. Each location in `locations` contains only the
 * provider(s) whose name matched.
 */
export interface ProviderNameSearchResultsArtifact {
  locations: LocationGroup[];
  query: string;
  location: string;
  /** First-name token the LLM passed (raw, pre-lowercase). */
  provider_first_name: string | null;
  /** Last-name token the LLM passed (raw, pre-lowercase). */
  provider_last_name: string | null;
  plan_id: string;
  radius_miles: number;
  /** Distinct NPIs across all returned locations. */
  matched_npis: string[];
  total_locations: number;
}

/**
 * Body of a `location_detail` artifact. Returned by
 * `get_location_providers` for the drill-down case ("show me everyone at
 * this location"). Always exactly one location group, no provider-level
 * filter.
 */
export interface LocationDetailArtifact {
  location: LocationGroup;
  plan_id: string;
  /**
   * Number of providers in `location.providers`. Equals the location's
   * complete in-network roster size only when `partial_results` is false.
   */
  returned_count: number;
  /**
   * `true` when the drill-down was capped and Qdrant indicated more
   * pages were available. Surface a "+N more" affordance or re-call
   * `get_location_providers` with a larger `group_size`.
   */
  partial_results: boolean;
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
  /** Background color for modal and content areas. Default: #fff */
  background?: string;
  /** Main text color. Default: #212124 */
  text?: string;
  /** Background color for the embedded concierge panel. */
  panelBackground?: string;
  /** Muted text color for helper copy and branding. */
  mutedText?: string;
  /** Background color for suggestion chips. */
  chipBackground?: string;
  /** Border color for suggestion chips and panel accents. */
  chipBorder?: string;
  /** Text color for suggestion chips. */
  chipText?: string;
}

/**
 * Widget dimension configuration for the chat UI.
 */
export interface VanillaChatDimensions {
  /** Modal width when expanded. Default: 1390px */
  width?: string;
  /** Modal height when expanded. Default: 980px */
  height?: string;
  /** Max width of the collapsed trigger bar. Default: 600px */
  triggerMaxWidth?: string;
  /** Max width of the concierge panel content area. Default: 1100px */
  panelMaxWidth?: string;
}

export type VanillaChatDisplayMode = 'trigger' | 'concierge';

export interface VanillaChatPromptSuggestion {
  label: string;
  prompt?: string;
  /** Visual emphasis. 'primary' renders the chip as a solid, conspicuous call-to-action. */
  emphasis?: 'primary';
  /**
   * When true and the user is anonymous, clicking the suggestion expands the
   * modal and renders the OTP verification card immediately — the prompt is
   * sent to the agent only after verification succeeds. Use for suggestions
   * that operate on the user's own data (e.g., "Show my past appointments")
   * so the verify step happens up front instead of waiting for the agent to
   * emit `{verification_flow}` in its response.
   */
  requiresAuth?: boolean;
}

/**
 * Pinned progress indicator emitted by the agent during multi-step flows
 * (e.g., scheduling). Encoded in message text between
 * `{scheduling_progress}` and `{/scheduling_progress}` tags as a JSON body.
 * The SDK hides the tag from the inline bubble and renders it as a pinned
 * progress bar at the top of the modal. Latest emission wins.
 */
export interface SchedulingProgressArtifact {
  /**
   * Step ids that have been satisfied for the current flow, in any order. The
   * SDK renders a fixed row of bubbles in canonical chat-flow order and
   * checks off whichever bubbles match these ids — so the agent can mark
   * insurance done in the first turn if the user volunteers their group ID
   * up front. Recognised ids for `flow: "schedule"`:
   *   "reason", "plan", "provider", "location", "time", "patient",
   *   "insurance", "verify".
   * Unknown ids are ignored. Send the full set each time (idempotent
   * replacement, not a diff).
   */
  completed_steps?: string[];
  /**
   * 1-indexed current step within the flow.
   *
   * @deprecated Prefer `completed_steps`. Retained for backward compatibility:
   * when `completed_steps` is absent, the SDK treats steps 1..current_step-1
   * as completed. Will be removed in a future major release.
   */
  current_step?: number;
  /**
   * Total number of steps in the flow.
   *
   * @deprecated Prefer `completed_steps`. Retained for backward compatibility
   * with the legacy stepped-bar UI; the new bubble row uses the SDK's
   * canonical step list instead.
   */
  total_steps?: number;
  /** Optional short label describing the current step (e.g., "Insurance details"). */
  step_label?: string;
  /** Optional flow identifier (e.g., "schedule", "cancel"). */
  flow?: string;
  /** When true, the SDK hides the progress UI. Use to close out the flow. */
  completed?: boolean;
}

export interface VanillaChatConciergePanel {
  /** Intro text shown above the trigger input. */
  introText?: string;
  /** Optional emphasized text rendered after the intro body. */
  introStrongText?: string;
  /** Example prompts rendered as clickable chips. */
  suggestions?: Array<string | VanillaChatPromptSuggestion>;
  /** Horizontal alignment for intro copy and footer. */
  align?: 'left' | 'center';
}

/**
 * Optional user profile for auth.upgrade (SDK: partner pre-collected data).
 * All fields optional; backend uses upsert semantics (only overwrites non-null values).
 */
export interface AuthUpgradeProfile {
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  date_of_birth?: string | null; // YYYY-MM-DD format
  gender?: string | null; // "male", "female", "other"
}

/**
 * Optional user address for auth.upgrade (SDK: partner pre-collected data).
 * address_line_1, city, state, zip_code required when provided.
 */
export interface AuthUpgradeAddress {
  address_line_1: string;
  address_line_2?: string | null;
  city: string;
  state: string;
  zip_code: string;
  country?: string; // defaults to "USA"
}

/**
 * Optional insurance for auth.upgrade. Backend resolves via enterprise.partner_plans.
 * Requires partner_identifier on SDK connection.
 */
export interface AuthUpgradeInsurance {
  partner_plan_id: string; // UUID
  member_id: string;
  group_id: string;
}

/**
 * Optional dependent for auth.upgrade (SDK: partner pre-collected data).
 */
export interface AuthUpgradeDependent {
  first_name: string;
  last_name: string;
  date_of_birth: string; // YYYY-MM-DD
  gender?: string | null;
  relationship_code: string; // Stedi code, e.g. "01" = spouse, "19" = child
  member_id?: string | null;
  insurance_index?: number | null; // index into the insurances array
}

/**
 * Container for optional profile-sync data sent with auth.upgrade.
 */
export interface AuthUpgradeProfileSyncData {
  user_profile?: AuthUpgradeProfile | null;
  user_address?: AuthUpgradeAddress | null;
  insurances?: AuthUpgradeInsurance[] | null;
  dependents?: AuthUpgradeDependent[] | null;
}

/**
 * Options for auth.upgrade. Token is required; profile sync and migrate_history are optional.
 */
export interface AuthUpgradeRequest extends AuthUpgradeProfileSyncData {
  token: string;
  migrateHistory?: boolean;
}

/**
 * Auth types the developer must choose from.
 * - passwordless: starts unauthenticated, user can verify via email/SMS
 * - tokenExchange: uses a partner-provided ID token to authenticate
 */
export type SdkAuthType = 'passwordless' | 'tokenExchange';

/**
 * Server-provided auth configuration (returned by sdk.session.created).
 * Contains only public fields -- no secrets.
 */
export interface SdkAuthConfig {
  auth0_client_id?: string;
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
  /** Display mode for the collapsed widget. Default: "trigger". */
  displayMode?: VanillaChatDisplayMode;
  /** Optional embedded concierge panel content. */
  concierge?: VanillaChatConciergePanel;
  /** Base font size for chat content (e.g. "14px", "1rem"). Default: 14px */
  fontSize?: string;
  /** Font family for the chat UI (e.g. "'Inter', sans-serif"). Default: Lato */
  fontFamily?: string;
  /** Widget dimensions (modal width/height, trigger max-width). */
  dimensions?: VanillaChatDimensions;
  /**
   * Optional profile-sync data to send with auth.upgrade (user_profile, user_address, insurances, dependents).
   * Can be static data or an async provider resolved at auth time.
   */
  authUpgradeProfileSync?: AuthUpgradeProfileSyncData | (() => Promise<AuthUpgradeProfileSyncData | null>);
}

