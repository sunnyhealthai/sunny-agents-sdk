# @sunnyhealthai/agents-sdk

Embed the Sunny Agents chat experience into any web application. This SDK provides both a headless client for custom UI implementations and a ready-to-use vanilla JavaScript chat widget.

## Installation

```bash
npm install @sunnyhealthai/agents-sdk
# or
pnpm add @sunnyhealthai/agents-sdk
# or
yarn add @sunnyhealthai/agents-sdk
```

## Quick Start

### Simplified API (Recommended)

The easiest way to get started is with `createSunnyChat()`, which automatically handles authentication and initialization. You need three required parameters: `partnerIdentifier`, `publicKey`, and `authType`. All auth configuration details (token exchange config, audience, etc.) are fetched from the server automatically.

**Path of least resistance:** Use `createSunnyChat` as your entry point and pick an auth type by simplicity:

1. **passwordless** — No external auth needed. User starts anonymous and verifies via email/SMS when prompted in the chat.
2. **tokenExchange** — You already have Auth0, Firebase, or similar. Provide `idTokenProvider` only; the server supplies audience, clientId, organization, etc.

#### Passwordless

Starts as anonymous chat. Users can verify via email/SMS when prompted. Customize with `headerTitle`, `placeholder`, `colors`, and other appearance options:

```ts
import { createSunnyChat } from "@sunnyhealthai/agents-sdk";

const chat = createSunnyChat({
  container: document.getElementById("chat"),
  partnerIdentifier: "your-partner-name",
  publicKey: "pk-sunnyagents_abc_xyz",
  authType: "passwordless",
  headerTitle: "Sunny Agents",
  placeholder: "Ask anything…",
  colors: { primary: "#006fff", secondary: "#212124", accent: "#22c55e" },
});

// Clean up when unmounting
// chat.destroy();
```

#### Custom Token Exchange

For partners with existing auth (Auth0, Firebase, etc.). You provide `idTokenProvider` only; the server supplies audience, clientId, organization, and tokenExchangeUrl based on your `publicKey`:

```ts
const chat = createSunnyChat({
  container: document.getElementById("chat"),
  partnerIdentifier: "your-partner-name",
  publicKey: "pk-sunnyagents_abc_xyz",
  authType: "tokenExchange",
  idTokenProvider: async () => localStorage.getItem("id_token"),
});
```

**Note:** `idTokenProvider` is required when `authType` is `'tokenExchange'`. All token exchange configuration comes from the server — you do not pass `tokenExchange` when using `createSunnyChat`.

#### Profile sync during auth upgrade

When upgrading from anonymous to authenticated, you can optionally send user profile, address, and insurance data so the backend persists it atomically during auth:

```ts
import { createSunnyChat, type AuthUpgradeProfile, type AuthUpgradeAddress, type AuthUpgradeInsurance } from "@sunnyhealthai/agents-sdk";

const chat = createSunnyChat({
  container: document.getElementById("chat"),
  partnerIdentifier: "your-partner-name",
  publicKey: "pk-sunnyagents_abc_xyz",
  authType: "tokenExchange",
  idTokenProvider: async () => getMyUserToken(),
  authUpgradeProfileSync: {
    user_profile: {
      first_name: "John",
      last_name: "Doe",
      phone: "+1234567890",
      date_of_birth: "1990-01-01", // YYYY-MM-DD
      gender: "male",
    },
    user_address: {
      address_line_1: "123 Main St",
      city: "San Francisco",
      state: "CA",
      zip_code: "94102",
      country: "USA",
    },
    insurances: [{
      partner_plan_id: "uuid-from-partner-plans",
      member_id: "M123456",
      group_id: "G789",
    }],
  },
});
```

`authUpgradeProfileSync` can also be an async provider: `async () => ({ user_profile: {...} })`.

#### Switching Auth Type at Runtime

The returned instance includes `setAuthType()` for switching authentication at runtime:

```ts
const chat = createSunnyChat({
  container: document.getElementById("chat"),
  partnerIdentifier: "your-partner-name",
  publicKey: "pk-sunnyagents_abc_xyz",
  authType: "passwordless",
});

// Later, switch to token exchange with a provider
await chat.setAuthType("tokenExchange", {
  idTokenProvider: async () => getMyUserToken(),
});
```

#### Brand Customization

Enterprise partners can customize the SDK appearance to match their brand via configuration—no source changes required:

```ts
const chat = createSunnyChat({
  container: document.getElementById("chat"),
  partnerIdentifier: "your-partner-name",
  publicKey: "pk-sunnyagents_abc_xyz",
  authType: "passwordless",
  // Appearance
  headerTitle: "Support Chat",
  placeholder: "How can we help?",
  fontSize: "16px", // Base font size (e.g. "14px", "1rem")
  fontFamily: "'Inter', sans-serif", // Custom font
  colors: {
    primary: "#006fff",
    secondary: "#212124",
    accent: "#22c55e",
    background: "#fff", // Modal and content background
    text: "#212124", // Main text color
  },
  dimensions: {
    width: "1200px",
    height: "800px",
    triggerMaxWidth: "500px",
  },
});
```

### Drop-in Chat Widget (Advanced)

For advanced use when you need to bypass server-driven config and provide `tokenExchange` or `idTokenProvider` manually, use `attachSunnyChat()` with a `SunnyAgentsConfig`:

```html
<div id="sunny-chat" style="height: 520px;"></div>
<script type="module">
  import { attachSunnyChat } from "@sunnyhealthai/agents-sdk";

  const { client, destroy } = attachSunnyChat({
    container: document.getElementById("sunny-chat"),
    config: {
      websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
      idTokenProvider: async () => localStorage.getItem("id_token"),
      tokenExchange: {
        partnerName: "your-partner-name",
        audience: "https://api.sunnyhealthai-staging.com",
        clientId: "your-client-id",
        organization: "your-organization-id",
      },
    },
    headerTitle: "Sunny Agents",
    placeholder: "Ask anything…",
  });

  // Clean up when unmounting
  // destroy();
</script>
```

### Headless Client

For full custom UIs when you do not want the built-in chat widget, use the headless client:

```ts
import { SunnyAgentsClient } from "@sunnyhealthai/agents-sdk";

const client = new SunnyAgentsClient({
  websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
  idTokenProvider: async () => localStorage.getItem("id_token"),
  tokenExchange: {
    partnerName: "your-partner-name",
    audience: "https://api.sunnyhealthai-staging.com",
    clientId: "your-client-id",
    organization: "your-organization-id",
  },
});

// Listen to events
client.on("snapshot", (snapshot) => {
  console.log("Current state:", snapshot);
});

client.on("streamingDelta", ({ conversationId, messageId, text }) => {
  console.log("Streaming text:", text);
});

client.on("streamingDone", ({ conversationId, messageId, text }) => {
  console.log("Message complete:", text);
});

// Send a message
await client.sendMessage("Hello, Sunny!");
```

## Configuration

### Authenticated Mode

When using authenticated mode, provide an `idTokenProvider` function that returns an ID token, along with `tokenExchange` configuration. The SDK will automatically exchange the ID token for an access token:

```ts
const client = new SunnyAgentsClient({
  websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
  idTokenProvider: async () => {
    // Return your ID token (e.g., from Auth0, Firebase, etc.)
    return localStorage.getItem("id_token");
  },
  tokenExchange: {
    partnerName: "your-partner-name", // e.g., "sunny-health-external-mock"
    audience: "https://api.sunnyhealthai-staging.com",
    clientId: "your-auth0-client-id",
    organization: "your-organization-id",
    tokenExchangeUrl: "https://auth.sunnyhealth.live/oauth/token", // Optional, defaults to this
  },
});
```

**Token Exchange Flow:**

1. Your app provides an ID token via `idTokenProvider`
2. The SDK exchanges it for an access token using the configured token exchange endpoint
3. The access token is cached and automatically refreshed when expired
4. The access token is used to authenticate WebSocket connections and API requests

**Configuration Options:**

- `idTokenProvider`: Function that returns a Promise resolving to an ID token string or null
- `tokenExchange.partnerName`: Partner identifier used to construct the subject token type (e.g., `"sunny-health-external-mock"`)
- `tokenExchange.audience`: API audience for the access token (e.g., `"https://api.sunnyhealthai-staging.com"`)
- `tokenExchange.clientId`: Auth0 client ID for token exchange
- `tokenExchange.organization`: Organization ID (required for token exchange)
- `tokenExchange.tokenExchangeUrl`: Optional token exchange endpoint URL (defaults to `"https://auth.sunnyhealth.live/oauth/token"`)

For anonymous mode (when `tokenExchange` is not used), you can pass `partnerName` at the top level of the config to identify the partner.

### Anonymous Mode

The recommended path is `createSunnyChat` with `authType: 'passwordless'` (see [Quick Start](#quick-start)). The user starts unauthenticated and can verify via email/SMS when prompted.

#### With `SunnyAgentsClient` (Low-Level)

For anonymous/local-only conversations without the built-in widget, omit `idTokenProvider` and `tokenExchange`. The SDK will operate in anonymous mode:

```ts
const client = new SunnyAgentsClient({
  websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
  partnerName: "your-partner-name",  // Optional: partner identifier for websocket
  // No idTokenProvider or tokenExchange = anonymous mode
});
```

Or explicitly disable server conversation creation:

```ts
const client = new SunnyAgentsClient({
  websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
  partnerName: "your-partner-name",  // Optional
  createServerConversations: false, // Explicitly disable server persistence
});
```

With the vanilla widget, you can use the `anonymous` option:

```ts
attachSunnyChat({
  container: document.getElementById("sunny-chat"),
  config: {
    websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
    partnerName: "your-partner-name",  // Optional: partner identifier for websocket
  },
  anonymous: true, // Enables anonymous mode (same as omitting idTokenProvider)
});
```

**Note:** Prefer `createSunnyChat` with `authType: 'passwordless'` when you want anonymous chat with optional in-chat verification. The low-level options above are for custom UIs or when bypassing server-driven config.

**Note:** `partnerName` can be passed in anonymous mode to identify the partner to the backend. It is sent as the `partner_identifier` query parameter on the websocket connection. `createServerConversations` defaults to `true` if both `idTokenProvider` and `tokenExchange` are provided, otherwise `false`.

### Passwordless Authentication

The path of least resistance for passwordless is `createSunnyChat` with `authType: 'passwordless'` (see [Quick Start](#quick-start)). Users start anonymous and verify via email/SMS when prompted.

**Benefits:**
- No page redirects - all authentication happens via WebSocket
- Email or SMS OTP verification
- Seamless integration with chat widget
- Optional chat history migration on authentication
- Works with token exchange for Sunny access tokens

**With `createSunnyChat` (Recommended):**

```ts
import { createSunnyChat } from '@sunnyhealthai/agents-sdk';

// Passwordless is handled automatically - verification UI appears in chat
const chat = createSunnyChat({
  container: document.getElementById('chat'),
  partnerIdentifier: 'your-partner-name',
  publicKey: 'pk-sunnyagents_abc_xyz',
  authType: 'passwordless',
});
```

When using `createSunnyChat` with `authType: 'passwordless'`, a `PasswordlessAuthManager` is created automatically and verification flow tags in chat messages (`{verification_flow}`) render a passwordless login form within the chat interface.

**Advanced: Use PasswordlessAuthManager directly:**

For custom flows, the `PasswordlessAuthManager` is exported as an internal API:

```ts
import { PasswordlessAuthManager, LLMWebSocketManager, attachSunnyChat } from '@sunnyhealthai/agents-sdk';

// Create shared WebSocket manager for passwordless auth and chat
const wsManager = new LLMWebSocketManager({
  websocketUrl: 'wss://chat.api.sunnyhealthai-staging.com',
});

// Initialize passwordless auth manager
const passwordlessAuth = new PasswordlessAuthManager({
  wsManager, // Required - WebSocket manager instance
  migrateHistory: true, // Migrate anonymous chat history to authenticated user
  storageType: 'sessionStorage', // 'memory', 'sessionStorage', or 'localStorage'
});

// Start passwordless login flow
await passwordlessAuth.startLogin({ email: 'user@example.com' });
// or
await passwordlessAuth.startLogin({ phoneNumber: '+1234567890' });

// Verify OTP code
await passwordlessAuth.verifyCode({
  email: 'user@example.com', // or phoneNumber
  code: '123456',
});

// Check authentication status
if (passwordlessAuth.isAuthenticated()) {
  const userId = passwordlessAuth.getUserId();
  const email = passwordlessAuth.getEmail();
}

// Use with chat widget
const { client, destroy } = attachSunnyChat({
  container: document.getElementById('chat'),
  passwordlessAuth, // Enables verification flow UI in chat messages
  config: {
    websocketUrl: 'wss://chat.api.sunnyhealthai-staging.com',
    wsManager, // Share the same WebSocket manager
  },
});
```

**Configuration Options (`PasswordlessAuthConfig`):**

- `wsManager: LLMWebSocketManager` - **Required** - WebSocket manager instance for sending passwordless auth messages
- `migrateHistory?: boolean` - Whether to migrate anonymous chat history to authenticated user on successful auth (default: `false`)
- `tokenExchange?: TokenExchangeConfig` - Optional token exchange configuration to obtain Sunny access tokens
- `storageKey?: string` - Optional storage key for persisting auth state (default: in-memory only)
- `storageType?: 'memory' | 'sessionStorage' | 'localStorage'` - Storage type for auth state (default: `'memory'`)

**Methods:**

- **`startLogin(options: PasswordlessStartOptions)`**: Start passwordless login flow by sending OTP code
  - `options.email?: string` - Email address (provide either email or phoneNumber)
  - `options.phoneNumber?: string` - Phone number (provide either email or phoneNumber)
  - Returns `Promise<void>`

- **`verifyCode(options: PasswordlessVerifyOptions)`**: Verify OTP code and authenticate user
  - `options.email?: string` - Email address used for login
  - `options.phoneNumber?: string` - Phone number used for login
  - `options.code: string` - OTP verification code
  - Returns `Promise<void>`

- **`getIdToken(): string | null`**: Get stored user ID (for compatibility with token exchange flows)

- **`getUserId(): string | null`**: Get authenticated user ID, or null if not authenticated

- **`getEmail(): string | null`**: Get authenticated user's email, or null if not authenticated

- **`getAccessToken(): Promise<string | null>`**: Get Sunny access token via token exchange if configured

- **`isAuthenticated(): boolean`**: Check if user is authenticated

- **`logout(): void`**: Clear authentication state

- **`onAuthStateChange(callback: (isAuthenticated: boolean) => void)`**: Subscribe to authentication state changes. Returns unsubscribe function.

- **`onOtpSent(callback: (connection: 'email' | 'sms') => void)`**: Subscribe to OTP sent events. Returns unsubscribe function.

- **`destroy(): void`**: Clean up resources and event listeners

See the [vanilla chat example](examples/vanilla-chat/) for a complete implementation with passwordless authentication.

## Breaking change: auth upgrade API

`LLMWebSocketManager.upgradeAuth` and `upgradeAuthIfPossible` now use options-based signatures:

**Before:**
```ts
await wsManager.upgradeAuth(token, true);
await wsManager.upgradeAuthIfPossible(true);
```

**After:**
```ts
await wsManager.upgradeAuth({ token, migrateHistory: true });
await wsManager.upgradeAuthIfPossible({ migrateHistory: true });
```

Profile-sync data can be included in both:
```ts
await wsManager.upgradeAuth({
  token,
  migrateHistory: true,
  user_profile: { first_name: "John", last_name: "Doe" },
  user_address: { address_line_1: "123 Main St", city: "SF", state: "CA", zip_code: "94102" },
});

await wsManager.upgradeAuthIfPossible({
  migrateHistory: true,
  profileSync: { user_profile: { first_name: "John" } },
});
```

## API Reference

### createSunnyChat

**Recommended API** - Unified entry point that automatically handles authentication and initialization. Auth configuration is retrieved from the server based on your `publicKey`.

```ts
createSunnyChat(options: UnifiedSunnyChatOptions): VanillaChatInstance
```

**Configuration Options (`UnifiedSunnyChatOptions`):**

- `container: HTMLElement` - Container element to mount the chat widget
- `partnerIdentifier: string` - **Required** - Partner identifier (sent as `partner_identifier` query param on websocket)
- `publicKey: string` - **Required** - Public API key (e.g., `"pk-sunnyagents_abc_xyz"`)
- `authType: SdkAuthType` - **Required** - Authentication type: `'passwordless'` or `'tokenExchange'`
- `idTokenProvider?: () => Promise<string | null>` - Function that returns an ID token. **Required** when `authType` is `'tokenExchange'`
- `websocketUrl?: string` - Override WebSocket URL (default: `"wss://chat.api.sunnyhealthai-staging.com"`)
- `wsManager?: LLMWebSocketManager` - Share a WebSocket manager across instances
- `devRoute?: string` - Developer route/destination for token exchange. If not provided, auto-extracted from URL query parameters (`?dev-route=...`)
- `headerTitle?: string` - Title displayed in chat header (default: `"Sunny Agents"`)
- `placeholder?: string` - Input placeholder text (default: `"Ask anything..."`)
- `colors?: VanillaChatColors` - Custom theme colors
- `fontSize?: string` - Base font size for chat content (e.g. `"14px"`, `"1rem"`). Default: `"14px"`
- `fontFamily?: string` - Font family for the chat UI (e.g. `"'Inter', sans-serif"`). Default: Lato
- `dimensions?: VanillaChatDimensions` - Widget dimensions (modal width/height, trigger max-width)
- `authUpgradeProfileSync?: AuthUpgradeProfileSyncData | (() => Promise<AuthUpgradeProfileSyncData | null>)` - Optional profile-sync data (user_profile, user_address, insurances) sent with auth.upgrade

**Returns:**

- `VanillaChatInstance` - Chat instance with:
  - `client: SunnyAgentsClient` - The underlying client instance
  - `destroy(): void` - Cleanup function to unmount the widget
  - `setAuthType(authType: SdkAuthType, options?: { idTokenProvider?; authUpgradeProfileSync? }): Promise<void>` - Switch authentication type at runtime

**How It Works:**

1. Creates and mounts the chat widget immediately (synchronous return)
2. Fetches server-provided auth configuration (`SdkAuthConfig`) via HTTP in the background
3. Activates the specified `authType` using the server configuration
4. For `tokenExchange`: proactively connects WebSocket, establishes SDK session, and authenticates — so the first message sends instantly

**Important Notes:**

- Auth configuration (audience, clientId, organization, etc.) comes from the server — you do not provide them
- `authType: 'passwordless'` starts anonymous with in-chat verification UI
- `authType: 'tokenExchange'` — you provide `idTokenProvider` only; server provides audience, clientId, organization, tokenExchangeUrl (based on `publicKey`)
- Use `setAuthType()` on the returned instance to switch auth types at runtime

### SunnyAgentsClient

The headless client for building custom chat UIs.

#### Constructor Options

```ts
new SunnyAgentsClient(config?: SunnyAgentsConfig)
```

**Configuration Options (`SunnyAgentsConfig`):**

- `websocketUrl?: string` - WebSocket URL for chat connection (defaults to `"wss://chat.api.sunnyhealthai-staging.com"`)
- `wsManager?: LLMWebSocketManager` - Optional WebSocket manager instance to share across multiple clients. Allows sharing the same WebSocket connection between `PasswordlessAuthManager` and `SunnyAgentsClient` for seamless authentication. If not provided, a new `LLMWebSocketManager` will be created.
- `idTokenProvider?: () => Promise<string | null>` - Function that returns an ID token for token exchange
- `partnerName?: string` - Partner identifier for websocket connection (used when `tokenExchange` not present, e.g. anonymous mode). Passed as `partner_identifier` query param.
- `publicKey?: string` - Public API key for SDK session creation (e.g., `"pk-sunnyagents_abc_xyz"`)
- `tokenExchange?: TokenExchangeConfig` - Token exchange configuration (required if using `idTokenProvider`)
  - `partnerName: string` - Partner identifier (e.g., `"sunny-health-external-mock"`)
  - `audience: string` - API audience for access token (e.g., `"https://api.sunnyhealthai-staging.com"`)
  - `clientId: string` - Auth0 client ID for token exchange
  - `organization: string` - Organization ID (required for token exchange)
  - `tokenExchangeUrl?: string` - Token exchange endpoint (defaults to `"https://auth.sunnyhealth.live/oauth/token"`)
  - `devRoute?: string` - Developer route/destination
- `sessionStorageKey?: string` - Key for session persistence (defaults to `"sunny_agents_session_id"`)
- `initialConversationId?: string` - Initial conversation ID to use
- `createServerConversations?: boolean` - Whether to create/persist conversations on server (defaults to `true` if `idTokenProvider` and `tokenExchange` are provided, otherwise `false`)
- `authUpgradeProfileSync?: AuthUpgradeProfileSyncData | (() => Promise<AuthUpgradeProfileSyncData | null>)` - Optional profile-sync data sent with auth.upgrade

#### Methods

- **`sendMessage(text: string, options?: SendMessageOptions)`**: Send a message and stream the response

  - `options.conversationId`: Target conversation (defaults to active conversation)
  - `options.title`: Set conversation title
  - `options.files`: Array of file attachments (base64 encoded)
  - `options.onMessageCreated`: Callback when message is created

- **`createConversation(title?: string | null, conversationId?: string | null)`**: Create a new conversation. Returns a Promise resolving to the conversation ID.

- **`setActiveConversation(conversationId: string | null)`**: Set the active conversation ID.

- **`getSnapshot()`**: Get current state snapshot. Returns `SunnyAgentsClientSnapshot` with `conversations` array and `activeConversationId`.

#### WebSocket session vs conversation

The server may assign a new WebSocket **session** after a disconnect (the SDK does not resume the previous `session_id`). **Conversation** identity is separate: `conversation_id`, the in-memory `conversations` map, and `activeConversationId` are kept for the lifetime of the `SunnyAgentsClient` instance (same tab). The next `sendMessage` continues the same conversation on the new transport session. Interrupted assistant streams are finalized (spinner cleared, partial text kept) when the socket closes.

- **`sendMcpApproval(conversationId: string, approvalRequestId: string, approve: boolean, reason?: string | null)`**: Send an MCP approval response for a pending approval request.

- **`setIdTokenProvider(provider: (() => Promise<string | null>) | undefined)`**: Dynamically update the ID token provider. Useful for updating authentication after a user logs in. Pass `undefined` to clear the provider.

- **`on(event, handler)`**: Subscribe to events. Returns an unsubscribe function.
- **`off(event, handler)`**: Unsubscribe from events

- **`subscribe(fn)`**: Subscribe to all state changes with a single callback. Returns an unsubscribe function.

#### Events

- `snapshot`: Emitted when state changes
- `conversationCreated`: Emitted when a new conversation is created
- `messagesUpdated`: Emitted when messages are updated
- `streamingDelta`: Emitted during message streaming (contains `conversationId`, `messageId`, `text`)
- `streamingDone`: Emitted when streaming completes
- `quickResponses`: Emitted when quick response suggestions are available

### attachSunnyChat

Mount a ready-to-use chat widget.

#### Options

- `container: HTMLElement` - HTMLElement to mount the chat widget
- `client?: SunnyAgentsClient` - Optional pre-configured client instance. If not provided, a new client will be created from `config`.
- `config?: SunnyAgentsConfig` - Configuration for creating a new client (same as `SunnyAgentsClient` constructor options). Ignored if `client` is provided.
- `headerTitle?: string` - Title displayed in the chat header (default: `"Sunny Agents"`)
- `placeholder?: string` - Input placeholder text (default: `"Ask anything…"`)
- `anonymous?: boolean` - Enable anonymous mode. Sets `createServerConversations: false` when no token provider is configured (default: `false`)
- `conversationId?: string` - Optional conversation ID to use for anonymous sessions. If not provided, a new UUID will be generated (in-memory only, no persistence).
- `passwordlessAuth?: PasswordlessAuthManager` - Optional PasswordlessAuthManager instance for handling verification flow in chat messages. When provided, verification flow tags in messages (`{verification_flow}`) will render a passwordless login form.
- `colors?: VanillaChatColors` - Custom theme colors
  - `primary?: string` - Primary color for user messages, send button, and focus states (default: `"#006fff"`)
  - `secondary?: string` - Secondary color for text and UI elements (default: `"#212124"`)
  - `accent?: string` - Accent color for success states and highlights (default: `"#22c55e"`)
  - `background?: string` - Background color for modal and content areas (default: `"#fff"`)
  - `text?: string` - Main text color (default: `"#212124"`)
- `fontSize?: string` - Base font size for chat content (e.g. `"14px"`, `"1rem"`). Default: `"14px"`
- `fontFamily?: string` - Font family for the chat UI (e.g. `"'Inter', sans-serif"`). Default: Lato
- `dimensions?: VanillaChatDimensions` - Widget dimensions
  - `width?: string` - Modal width when expanded (default: `"1390px"`)
  - `height?: string` - Modal height when expanded (default: `"980px"`)
  - `triggerMaxWidth?: string` - Max width of collapsed trigger bar (default: `"600px"`)

#### Returns (`VanillaChatInstance`)

- `client: SunnyAgentsClient` - The underlying `SunnyAgentsClient` instance
- `destroy(): void` - Cleanup function to unmount the widget and clean up event listeners
- `setAuthType?(authType: SdkAuthType, options?): Promise<void>` - Switch auth type at runtime. Only available when the instance was created via `createSunnyChat()`.

## File Uploads

Send files as base64-encoded attachments:

```ts
await client.sendMessage("Analyze this image", {
  files: [
    {
      filename: "image.png",
      content: "base64-encoded-content-here",
    },
  ],
});
```

## Artifacts

Artifacts (like doctor profiles) are delivered **inline in message text** via the WebSocket. The backend expands artifact tags just-in-time (JIT) during streaming. Parse `message.text` for embedded JSON objects with `item_type` and `item_content`. The vanilla widget automatically parses and renders them. See the [documentation](https://docs.sunnyhealthai.com/artifacts) for parsing examples.

## Framework Integration

This SDK has no framework dependencies. You can use it with:

- **React**: Use the headless client and build your own UI components
- **Vue**: Use the headless client with Vue's reactivity system
- **Vanilla JavaScript**: Use either the headless client or the `attachSunnyChat` widget
- **Any other framework**: The headless client works with any framework

## TypeScript Support

This package includes full TypeScript definitions. Import types and classes as needed:

```ts
import {
  createSunnyChat, // Recommended unified API
  SunnyAgentsClient, // Class, not a type
  attachSunnyChat,
  type ConversationState,
  type SunnyAgentMessage,
  type SunnyAgentMessageRole, // 'user' | 'assistant' | 'system'
  type SunnyAgentMessageItem, // Output items (MCP approvals, content fragments, etc.)
  type SunnyAgentMessageContentFragment, // Content fragment within a message item
  type SunnyAgentsConfig,
  type UnifiedSunnyChatOptions, // Unified config type for createSunnyChat
  type SdkAuthType, // 'passwordless' | 'tokenExchange'
  type SdkAuthConfig, // Server-provided auth configuration
  type AuthUpgradeProfile, // Profile fields for auth.upgrade
  type AuthUpgradeAddress, // Address for auth.upgrade
  type AuthUpgradeInsurance, // Insurance for auth.upgrade
  type AuthUpgradeProfileSyncData, // Container for profile-sync data
  type AuthUpgradeRequest, // Options for upgradeAuth
  type SendMessageOptions,
  type SunnyAgentsClientSnapshot,
  type FileAttachment, // File attachment for sendMessage
  type ChatArtifact,
  type DoctorProfileArtifact,
  type ProviderSearchResultsArtifact, // Provider search results artifact
  type ProviderResult, // Individual provider result
  type LocationResult, // Provider location result
  type VanillaChatOptions,
  type VanillaChatInstance,
  type VanillaChatColors,
  type PasswordlessStartOptions, // Options for starting passwordless login
  type PasswordlessVerifyOptions, // Options for verifying OTP code
  type PasswordlessAuthState, // Current passwordless auth state
} from "@sunnyhealthai/agents-sdk";

// Internal APIs (exported for advanced use cases but not recommended for most users)
import {
  PasswordlessAuthManager, // Internal - Passwordless authentication manager
  LLMWebSocketManager, // Internal - WebSocket manager
  TokenExchangeManager, // Internal - Token exchange manager
  exchangeIdTokenForAccessToken, // Internal - Direct token exchange function
  type PasswordlessAuthConfig, // Internal - Passwordless auth configuration
  type LLMWebSocketConfig, // Internal - WebSocket configuration
  type TokenExchangeConfig, // Internal - Token exchange configuration
  type TokenExchangeResponse, // Internal - Token exchange response
} from "@sunnyhealthai/agents-sdk";
```
