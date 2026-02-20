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

The easiest way to get started is with `createSunnyChat()`, which automatically handles authentication and initialization. You need three required parameters: `partnerIdentifier`, `publicKey`, and `authType`. All auth configuration details (Auth0 domain, client ID, token exchange config, etc.) are fetched from the server automatically.

**Path of least resistance:** Use `createSunnyChat` as your entry point and pick an auth type by simplicity:

1. **passwordless** — No external auth needed. User starts anonymous and verifies via email/SMS when prompted in the chat.
2. **tokenExchange** — You already have Auth0, Firebase, or similar. Provide `idTokenProvider` only; the server supplies audience, clientId, organization, etc.
3. **saml** / **oidc** — Enterprise SSO. Auth0 popup triggers automatically.

#### Passwordless

Starts as anonymous chat. Users can verify via email/SMS when prompted. Customize with `headerTitle`, `placeholder`, and `colors`:

```ts
import { createSunnyChat } from "@sunnyhealthai/agents-sdk";

const chat = await createSunnyChat({
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
const chat = await createSunnyChat({
  container: document.getElementById("chat"),
  partnerIdentifier: "your-partner-name",
  publicKey: "pk-sunnyagents_abc_xyz",
  authType: "tokenExchange",
  idTokenProvider: async () => localStorage.getItem("id_token"),
});
```

**Note:** `idTokenProvider` is required when `authType` is `'tokenExchange'`. All token exchange configuration comes from the server — you do not pass `tokenExchange` when using `createSunnyChat`.

#### SAML/OIDC (Enterprise SSO)

For SAML or OIDC via Auth0. Authentication popup triggers automatically. Auth configuration (domain, client ID, connection name) comes from the server:

```ts
const chat = await createSunnyChat({
  container: document.getElementById("chat"),
  partnerIdentifier: "your-partner-name",
  publicKey: "pk-sunnyagents_abc_xyz",
  authType: "saml", // or 'oidc' for OIDC connections
});
```

**Note:** Auth0 handles token exchange via standard OAuth flow.

#### Switching Auth Type at Runtime

The returned instance includes `setAuthType()` for switching authentication at runtime:

```ts
const chat = await createSunnyChat({
  container: document.getElementById("chat"),
  partnerIdentifier: "your-partner-name",
  publicKey: "pk-sunnyagents_abc_xyz",
  authType: "passwordless",
});

// Later, switch to SAML
await chat.setAuthType("saml");

// Or switch to token exchange with a provider
await chat.setAuthType("tokenExchange", {
  idTokenProvider: async () => getMyUserToken(),
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

### Auth0 Enterprise Connection (SAML/OIDC)

For partners using SAML or OIDC authentication (e.g., Guardian), you can configure it as an **Auth0 Enterprise Connection**. This approach leverages Auth0's built-in support, eliminating the need for SAML/OIDC parsing in your application.

**Benefits:**
- No SAML/OIDC parsing needed - Auth0 handles all complexity
- Popup-based authentication (no page redirects) - perfect for widgets
- Silent authentication - auto-authenticate if user already has Auth0 session
- Built-in security - Auth0 handles signature validation, replay protection, etc.
- Automatic authentication - `createSunnyChat()` handles everything automatically

**Setup Steps:**

1. **Configure SAML/OIDC in Auth0 Dashboard:**
   - Create Enterprise Connection (SAML or OIDC)
   - Configure metadata (Entity ID, Sign-in URL, X.509 Certificate for SAML)
   - Map attributes to Auth0 user profile
   - Enable the connection for your Auth0 application

2. **Use `createSunnyChat` (Recommended):**

All Auth0 configuration (domain, client ID, connection name) is retrieved from the server based on your `publicKey`. You only specify the `authType`:

```ts
import { createSunnyChat } from '@sunnyhealthai/agents-sdk';

// Authentication happens automatically!
const chat = await createSunnyChat({
  container: document.getElementById('chat'),
  partnerIdentifier: 'your-partner-name',
  publicKey: 'pk-sunnyagents_abc_xyz',
  authType: 'saml', // or 'oidc' for OIDC connections
});
```

3. **Advanced: Use Auth0Provider directly (for custom flows):**

The `Auth0Provider` class is exported as an internal API for advanced use cases where you need full control over authentication. When using it directly, you must provide all configuration yourself:

```ts
import { Auth0Provider, SunnyAgentsClient } from '@sunnyhealthai/agents-sdk';

// Initialize Auth0 provider with your own config
const auth0Provider = new Auth0Provider({
  domain: 'your-tenant.auth0.com',
  clientId: 'your-client-id',
  redirectUri: window.location.origin + '/callback',
  connection: 'guardian-saml', // Your SAML connection name
  audience: 'https://api.sunnyhealthai-staging.com', // Optional
  usePopup: true, // Use popup mode (no redirects) - default: true
  useModal: true, // Use native modal overlay - default: true
  storageType: 'sessionStorage', // or 'localStorage' for persistence
});

// Try silent authentication first (no UI)
try {
  await auth0Provider.checkSession();
} catch (error) {
  // No session, user needs to authenticate
}

// If not authenticated, open modal (no page redirect)
if (!auth0Provider.isAuthenticated()) {
  try {
    await auth0Provider.authorizePopup();
    // Modal closed, tokens are now available
  } catch (error) {
    // User closed modal or error occurred
    // Fallback to redirect mode if needed:
    // auth0Provider.authorizeRedirect();
  }
}

// Use with SDK
const client = new SunnyAgentsClient({
  websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
  idTokenProvider: () => Promise.resolve(auth0Provider.getIdToken()),
});
```

**Authentication Modes:**

- **Modal Overlay (Default)** - Opens Auth0 in a native-feeling modal overlay with backdrop blur, no page redirects. Perfect for widgets.
- **Popup Window** - Opens Auth0 in a popup window (set `useModal: false`). Falls back to this if modal doesn't work.
- **Silent Authentication** - Attempts to authenticate without UI if user already has Auth0 session.
- **Redirect Mode** - Full page redirect for traditional web apps (set `usePopup: false`).

**Auth0Provider API:**

- `authorizePopup()` - Open Auth0 in popup window (returns Promise)
- `authorizeRedirect()` - Redirect to Auth0 (full page)
- `checkSession()` - Silent authentication check (no UI)
- `handleCallback()` - Parse tokens from callback URL (for redirect mode)
- `getIdToken()` - Get current ID token
- `getAccessToken()` - Get current access token
- `isAuthenticated()` - Check if user is authenticated
- `logout(redirectToLogout?, returnTo?)` - Clear tokens and optionally redirect to Auth0 logout

See the [Auth0 SAML example](examples/auth0-saml-chat/) for a complete implementation using `createSunnyChat()`.

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
const chat = await createSunnyChat({
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

## API Reference

### createSunnyChat

**Recommended API** - Unified entry point that automatically handles authentication and initialization. Auth configuration (Auth0 domain, client ID, connection, etc.) is retrieved from the server based on your `publicKey`.

```ts
createSunnyChat(options: UnifiedSunnyChatOptions): Promise<VanillaChatInstance>
```

**Configuration Options (`UnifiedSunnyChatOptions`):**

- `container: HTMLElement` - Container element to mount the chat widget
- `partnerIdentifier: string` - **Required** - Partner identifier (sent as `partner_identifier` query param on websocket)
- `publicKey: string` - **Required** - Public API key (e.g., `"pk-sunnyagents_abc_xyz"`)
- `authType: SdkAuthType` - **Required** - Authentication type: `'passwordless'`, `'saml'`, `'oidc'`, or `'tokenExchange'`
- `idTokenProvider?: () => Promise<string | null>` - Function that returns an ID token. **Required** when `authType` is `'tokenExchange'`
- `websocketUrl?: string` - Override WebSocket URL (default: `"wss://chat.api.sunnyhealthai-staging.com"`)
- `wsManager?: LLMWebSocketManager` - Share a WebSocket manager across instances
- `devRoute?: string` - Developer route/destination for token exchange. If not provided, auto-extracted from URL query parameters (`?dev-route=...`)
- `headerTitle?: string` - Title displayed in chat header (default: `"Sunny Agents"`)
- `placeholder?: string` - Input placeholder text (default: `"Ask anything..."`)
- `colors?: VanillaChatColors` - Custom theme colors

**Returns:**

- `Promise<VanillaChatInstance>` - Promise resolving to chat instance with:
  - `client: SunnyAgentsClient` - The underlying client instance
  - `destroy(): void` - Cleanup function to unmount the widget
  - `setAuthType(authType: SdkAuthType, options?: { idTokenProvider? }): Promise<void>` - Switch authentication type at runtime

**How It Works:**

1. Connects to the WebSocket server and sends `sdk.session.create` with your `publicKey`
2. Receives server-provided auth configuration (`SdkAuthConfig`) via `sdk.session.created`
3. Activates the specified `authType` using the server configuration
4. Creates and mounts the chat widget

**Important Notes:**

- All auth configuration (Auth0 domain, client ID, connection, audience, etc.) comes from the server — you do not provide them
- `authType: 'passwordless'` starts anonymous with in-chat verification UI
- `authType: 'tokenExchange'` — you provide `idTokenProvider` only; server provides audience, clientId, organization, tokenExchangeUrl (based on `publicKey`)
- `authType: 'saml'` or `'oidc'` triggers automatic Auth0 popup authentication
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

#### Methods

- **`sendMessage(text: string, options?: SendMessageOptions)`**: Send a message and stream the response

  - `options.conversationId`: Target conversation (defaults to active conversation)
  - `options.title`: Set conversation title
  - `options.files`: Array of file attachments (base64 encoded)
  - `options.onMessageCreated`: Callback when message is created

- **`createConversation(title?: string | null, conversationId?: string | null)`**: Create a new conversation. Returns a Promise resolving to the conversation ID.

- **`setActiveConversation(conversationId: string | null)`**: Set the active conversation ID.

- **`getSnapshot()`**: Get current state snapshot. Returns `SunnyAgentsClientSnapshot` with `conversations` array and `activeConversationId`.

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
  type SdkAuthType, // 'passwordless' | 'saml' | 'oidc' | 'tokenExchange'
  type SdkAuthConfig, // Server-provided auth configuration
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
  Auth0Provider, // Internal - Auth0 authentication provider
  PasswordlessAuthManager, // Internal - Passwordless authentication manager
  LLMWebSocketManager, // Internal - WebSocket manager
  TokenExchangeManager, // Internal - Token exchange manager
  exchangeIdTokenForAccessToken, // Internal - Direct token exchange function
  type Auth0ProviderConfig, // Internal - Auth0 provider configuration
  type PopupOptions, // Internal - Popup window options for Auth0
  type PasswordlessAuthConfig, // Internal - Passwordless auth configuration
  type LLMWebSocketConfig, // Internal - WebSocket configuration
  type TokenExchangeConfig, // Internal - Token exchange configuration
  type TokenExchangeResponse, // Internal - Token exchange response
} from "@sunnyhealthai/agents-sdk";
```
