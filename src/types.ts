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
  authorizeUrl?: string;
  /**
   * Provider function that returns an ID token for token exchange.
   * The SDK will automatically exchange this ID token for an access token.
   */
  idTokenProvider?: () => Promise<string | null>;
  sessionStorageKey?: string;
  initialConversationId?: string;
  /**
   * Base URL for REST API calls (e.g., fetching artifacts). Defaults to
   * https://api.sunnyhealthai-staging.com.
   */
  apiBaseUrl?: string;
  /**
   * Whether to create/persist conversations on the server.
   * Defaults to true if an idTokenProvider is supplied, otherwise false (anonymous).
   */
  createServerConversations?: boolean;
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

