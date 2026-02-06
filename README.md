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

The easiest way to get started is with `createSunnyChat()`, which automatically handles authentication and initialization:

#### SAML/OIDC Authentication (Auto-Login)

For SAML or OIDC authentication via Auth0, provide your Auth0 configuration with `type: 'saml'` or `type: 'oidc'`. Authentication happens automatically:

```ts
import { createSunnyChat } from "@sunnyhealthai/agents-sdk";

const chat = await createSunnyChat({
  container: document.getElementById("chat"),
  websocketUrl: "wss://llm.sunnyhealth.live",
  auth: {
    type: 'saml', // or 'oidc' for OIDC connections
    domain: "your-tenant.auth0.com",
    clientId: "your-client-id",
    connection: "guardian-saml", // SAML/OIDC connection name - triggers auto-login
    audience: "https://api.sunnyhealthai-staging.com", // API audience
  },
  headerTitle: "Sunny Agents",
  placeholder: "Ask anything…",
});

// Clean up when unmounting
// chat.destroy();
```

**Note:** When using SAML/OIDC authentication, Auth0 handles token exchange via standard OAuth flow. Do not provide token exchange config - they are mutually exclusive.

#### Custom Token Exchange

For custom JWT token exchange flows (not SAML/OIDC):

```ts
const chat = await createSunnyChat({
  container: document.getElementById("chat"),
  websocketUrl: "wss://llm.sunnyhealth.live",
  auth: {
    type: 'tokenExchange',
    idTokenProvider: async () => localStorage.getItem("id_token"),
    partnerName: "your-partner-name",
    audience: "https://api.sunnyhealthai-staging.com",
    clientId: "your-client-id",
  },
});
```

**Note:** Custom token exchange requires `idTokenProvider` and is mutually exclusive with SAML/OIDC authentication.

#### Anonymous Mode

For anonymous chat without authentication:

```ts
const chat = await createSunnyChat({
  container: document.getElementById("chat"),
  websocketUrl: "wss://llm.sunnyhealth.live",
  anonymous: true,
});
```

### Option 1: Drop-in Chat Widget (Advanced)

The easiest way to get started is with the pre-built chat widget:

```html
<div id="sunny-chat" style="height: 520px;"></div>
<script type="module">
  import { attachSunnyChat } from "@sunnyhealthai/agents-sdk";

  const { client, destroy } = attachSunnyChat({
    container: document.getElementById("sunny-chat"),
    config: {
      websocketUrl: "wss://llm.sunnyhealth.live",
      idTokenProvider: async () => localStorage.getItem("id_token"),
      tokenExchange: {
        partnerName: "your-partner-name",
        audience: "https://api.sunnyhealthai-staging.com",
        clientId: "your-client-id",
      },
    },
    headerTitle: "Sunny Agents",
    placeholder: "Ask anything…",
  });

  // Clean up when unmounting
  // destroy();
</script>
```

### Option 2: Headless Client

For custom UI implementations, use the headless client:

```ts
import { SunnyAgentsClient } from "@sunnyhealthai/agents-sdk";

const client = new SunnyAgentsClient({
  websocketUrl: "wss://llm.sunnyhealth.live",
  idTokenProvider: async () => localStorage.getItem("id_token"),
  tokenExchange: {
    partnerName: "your-partner-name",
    audience: "https://api.sunnyhealthai-staging.com",
    clientId: "your-client-id",
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
  websocketUrl: "wss://llm.sunnyhealth.live",
  idTokenProvider: async () => {
    // Return your ID token (e.g., from Auth0, Firebase, etc.)
    return localStorage.getItem("id_token");
  },
  tokenExchange: {
    partnerName: "your-partner-name", // e.g., "sunny-health-external-mock"
    audience: "https://api.sunnyhealthai-staging.com",
    clientId: "your-auth0-client-id",
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
- `tokenExchange.tokenExchangeUrl`: Optional token exchange endpoint URL (defaults to `"https://auth.sunnyhealth.live/oauth/token"`)

### Anonymous Mode

For anonymous/local-only conversations, omit the `idTokenProvider` and `tokenExchange` configuration. The SDK will automatically operate in anonymous mode:

```ts
const client = new SunnyAgentsClient({
  websocketUrl: "wss://llm.sunnyhealth.live",
  // No idTokenProvider or tokenExchange = anonymous mode
});
```

Or explicitly disable server conversation creation:

```ts
const client = new SunnyAgentsClient({
  websocketUrl: "wss://llm.sunnyhealth.live",
  createServerConversations: false, // Explicitly disable server persistence
});
```

With the vanilla widget, you can use the `anonymous` option:

```ts
attachSunnyChat({
  container: document.getElementById("sunny-chat"),
  config: {
    websocketUrl: "wss://llm.sunnyhealth.live",
  },
  anonymous: true, // Enables anonymous mode (same as omitting idTokenProvider)
});
```

**Note:** `createServerConversations` defaults to `true` if both `idTokenProvider` and `tokenExchange` are provided, otherwise `false`. The `anonymous` option in `attachSunnyChat` sets `createServerConversations: false` when no token provider is configured.

### Auth0 Enterprise Connection (SAML)

For partners using SAML authentication (e.g., Guardian), you can configure SAML as an **Auth0 Enterprise Connection**. This approach leverages Auth0's built-in SAML support, eliminating the need for SAML parsing in your application.

**Benefits:**
- ✅ No SAML parsing needed - Auth0 handles all SAML complexity
- ✅ Popup-based authentication (no page redirects) - perfect for widgets
- ✅ Silent authentication - auto-authenticate if user already has Auth0 session
- ✅ Built-in security - Auth0 handles signature validation, replay protection, etc.
- ✅ **Automatic authentication** - `createSunnyChat()` handles everything automatically

**Setup Steps:**

1. **Configure SAML in Auth0 Dashboard:**
   - Create Enterprise Connection → SAML
   - Configure SAML metadata (Entity ID, Sign-in URL, X.509 Certificate)
   - Map SAML attributes to Auth0 user profile
   - Enable the connection for your Auth0 application

2. **Use the simplified API (Recommended):**

```ts
import { createSunnyChat } from '@sunnyhealthai/agents-sdk';

// Authentication happens automatically!
const chat = await createSunnyChat({
  container: document.getElementById('chat'),
  auth: {
    type: 'saml', // or 'oidc' for OIDC connections
    domain: 'your-tenant.auth0.com',
    clientId: 'your-client-id',
    connection: 'guardian-saml', // SAML/OIDC connection name - triggers auto-login
    audience: 'https://api.sunnyhealthai-staging.com',
  },
});
```

**Note:** When using SAML/OIDC authentication (`auth.type: 'saml'` or `'oidc'`), Auth0 handles token exchange via standard OAuth flow. Do not provide token exchange config - they are mutually exclusive.

3. **Advanced: Use Auth0Provider directly (for custom flows):**

```ts
import { Auth0Provider, SunnyAgentsClient } from '@sunnyhealthai/agents-sdk';

// Initialize Auth0 provider
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
  websocketUrl: "wss://llm.sunnyhealth.live",
  idTokenProvider: () => Promise.resolve(auth0Provider.getIdToken()),
  // Note: No tokenExchange - Auth0 handles token exchange via OAuth
});
```

**With the vanilla widget:**

```ts
import { Auth0Provider, attachSunnyChat } from '@sunnyhealthai/agents-sdk';

const auth0Provider = new Auth0Provider({
  domain: 'your-tenant.auth0.com',
  clientId: 'your-client-id',
  redirectUri: window.location.origin + '/callback',
  connection: 'guardian-saml',
  useModal: true, // Use native modal overlay (default: true)
});

// Authenticate user
if (!auth0Provider.isAuthenticated()) {
  await auth0Provider.authorizePopup();
}

// Initialize chat widget
const { client, destroy } = attachSunnyChat({
  container: document.getElementById('sunny-chat'),
  config: {
    websocketUrl: "wss://llm.sunnyhealth.live",
    idTokenProvider: () => Promise.resolve(auth0Provider.getIdToken()),
    tokenExchange: {
      partnerName: 'guardian',
      audience: 'https://api.sunnyhealthai-staging.com',
      clientId: 'your-auth0-client-id',
    },
  },
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

See the [Auth0 SAML example](examples/auth0-saml-chat/) for a complete implementation using the simplified `createSunnyChat()` API.

### Passwordless Authentication

For passwordless authentication via email or SMS, use the `PasswordlessAuthManager`. This provides WebSocket-based authentication that eliminates page refreshes and redirects.

**Benefits:**
- ✅ No page redirects - all authentication happens via WebSocket
- ✅ Email or SMS OTP verification
- ✅ Seamless integration with chat widget
- ✅ Optional chat history migration on authentication
- ✅ Works with token exchange for Sunny access tokens

**Basic Usage:**

```ts
import { PasswordlessAuthManager, LLMWebSocketManager, attachSunnyChat } from '@sunnyhealthai/agents-sdk';

// Create shared WebSocket manager for passwordless auth and chat
const wsManager = new LLMWebSocketManager({
  websocketUrl: 'wss://llm.sunnyhealth.live',
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
    websocketUrl: 'wss://llm.sunnyhealth.live',
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

**Integration with Chat Widget:**

When `passwordlessAuth` is provided to `attachSunnyChat()`, verification flow tags in chat messages (`{verification_flow}`) will automatically render a passwordless login form, allowing users to authenticate directly within the chat interface.

**Example with Token Exchange:**

```ts
import { PasswordlessAuthManager, LLMWebSocketManager, attachSunnyChat } from '@sunnyhealthai/agents-sdk';

const wsManager = new LLMWebSocketManager({
  websocketUrl: 'wss://llm.sunnyhealth.live',
  tokenExchange: {
    partnerName: 'your-partner-name',
    audience: 'https://api.sunnyhealthai-staging.com',
    clientId: 'your-client-id',
  },
});

const passwordlessAuth = new PasswordlessAuthManager({
  wsManager,
  tokenExchange: {
    partnerName: 'your-partner-name',
    audience: 'https://api.sunnyhealthai-staging.com',
    clientId: 'your-client-id',
  },
  migrateHistory: true,
});

// After authentication, access tokens are available
const accessToken = await passwordlessAuth.getAccessToken();
```

See the [vanilla chat example](examples/vanilla-chat/) for a complete implementation with passwordless authentication.

## API Reference

### createSunnyChat

**Recommended API** - Unified entry point that automatically handles authentication and initialization.

```ts
createSunnyChat(options: UnifiedSunnyChatOptions): Promise<VanillaChatInstance>
```

**Configuration Options (`UnifiedSunnyChatOptions`):**

- `container: HTMLElement` - Container element to mount the chat widget
- `websocketUrl?: string` - WebSocket URL for chat connection
- `apiBaseUrl?: string` - Base URL for REST API calls (e.g., artifact fetching)
- `auth?: AuthConfig` - Authentication configuration (mutually exclusive options):
  
  **Option 1: SAML/OIDC Authentication (`SamlOidcAuthConfig`)**
  - `type: 'saml' | 'oidc'` - Authentication type
  - `domain: string` - Auth0 domain (e.g., `'your-tenant.auth0.com'`)
  - `clientId: string` - Auth0 client ID
  - `connection: string` - SAML/OIDC connection name - triggers automatic authentication
  - `organization?: string` - Organization ID or name (required for some clients)
  - `audience?: string` - API audience for access tokens
  - `redirectUri?: string` - Callback URL after authentication (defaults to current origin + '/callback.html')
  - `usePopup?: boolean` - Use popup instead of redirect (default: `true`)
  - `useModal?: boolean` - Use modal overlay instead of popup window (default: `true`)
  - `storageType?: 'sessionStorage' | 'localStorage'` - Token storage type (default: `'sessionStorage'`)
  
  **Option 2: Custom Token Exchange (`TokenExchangeAuthConfig`)**
  - `type: 'tokenExchange'` - Authentication type
  - `idTokenProvider: () => Promise<string | null>` - Function that returns ID token for exchange
  - `partnerName: string` - Partner identifier
  - `audience: string` - API audience for access token
  - `clientId: string` - Auth0 client ID for token exchange
  - `tokenExchangeUrl?: string` - Token exchange endpoint URL
  - `devRoute?: string` - Developer route/destination

- `headerTitle?: string` - Title displayed in chat header (default: `"Sunny Agents"`)
- `placeholder?: string` - Input placeholder text (default: `"Ask anything…"`)
- `colors?: VanillaChatColors` - Custom theme colors
- `anonymous?: boolean` - Enable anonymous mode explicitly (default: `true` if no auth, otherwise `false`)

**Returns:**

- `Promise<VanillaChatInstance>` - Promise resolving to chat instance with:
  - `client: SunnyAgentsClient` - The underlying client instance
  - `destroy(): void` - Cleanup function to unmount the widget

**Important Notes:**

- SAML/OIDC (`auth.type: 'saml'` or `'oidc'`) and token exchange (`auth.type: 'tokenExchange'`) are **mutually exclusive**
- When using SAML/OIDC, Auth0 handles token exchange via standard OAuth flow
- When using token exchange, you must provide `idTokenProvider` within the auth config
- Authentication happens automatically when `auth` is provided

### SunnyAgentsClient

The headless client for building custom chat UIs.

#### Constructor Options

```ts
new SunnyAgentsClient(config?: SunnyAgentsConfig)
```

**Configuration Options (`SunnyAgentsConfig`):**

- `websocketUrl?: string` - WebSocket URL for chat connection (defaults to `"wss://llm.sunnyhealth.live"`)
- `wsManager?: LLMWebSocketManager` - Optional WebSocket manager instance to share across multiple clients. Allows sharing the same WebSocket connection between `PasswordlessAuthManager` and `SunnyAgentsClient` for seamless authentication. If not provided, a new `LLMWebSocketManager` will be created.
- `idTokenProvider?: () => Promise<string | null>` - Function that returns an ID token for token exchange
- `tokenExchange?: TokenExchangeConfig` - Token exchange configuration (required if using `idTokenProvider`)
  - `partnerName: string` - Partner identifier (e.g., `"sunny-health-external-mock"`)
  - `audience: string` - API audience for access token (e.g., `"https://api.sunnyhealthai-staging.com"`)
  - `clientId: string` - Auth0 client ID for token exchange
  - `tokenExchangeUrl?: string` - Token exchange endpoint (defaults to `"https://auth.sunnyhealth.live/oauth/token"`)
- `apiBaseUrl?: string` - Base URL for REST API calls like artifact fetching (defaults to `"https://api.sunnyhealthai-staging.com"`)
- `sessionStorageKey?: string` - localStorage key for session persistence (defaults to `"sunny_agents_session_id"`)
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

- **`getArtifact<T>(artifactId: string)`**: Fetch a chat artifact by ID. Returns a Promise resolving to `ChatArtifact<T> | null`. Requires authenticated mode (`idTokenProvider` and `tokenExchange`).

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

- `container`: HTMLElement to mount the chat widget
- `client?: SunnyAgentsClient` - Optional pre-configured client instance. If not provided, a new client will be created from `config`.
- `config?: SunnyAgentsConfig` - Configuration for creating a new client (same as `SunnyAgentsClient` constructor options). Ignored if `client` is provided.
- `headerTitle?: string` - Title displayed in the chat header (default: `"Sunny Agents"`)
- `placeholder?: string` - Input placeholder text (default: `"Ask anything…"`)
- `anonymous?: boolean` - Enable anonymous mode. Sets `createServerConversations: false` when no token provider is configured (default: `false`)
- `conversationId?: string` - Optional conversation ID to use for anonymous sessions. If not provided, a new UUID will be generated (in-memory only, no persistence).
- `passwordlessAuth?: PasswordlessAuthManager` - Optional PasswordlessAuthManager instance for handling verification flow in chat messages. When provided, verification flow tags in messages (`{verification_flow}`) will render a passwordless login form.
- `conversationStorageKey?: string` - localStorage key for persisting conversation ID (default: `"sunny_agents_conversation_id"`)
- `colors?: VanillaChatColors` - Custom theme colors
  - `primary?: string` - Primary color for user messages, send button, and focus states (default: `"#006fff"`)
  - `secondary?: string` - Secondary color for text and UI elements (default: `"#212124"`)
  - `accent?: string` - Accent color for success states and highlights (default: `"#22c55e"`)

#### Returns

- `client`: The underlying `SunnyAgentsClient` instance
- `destroy()`: Cleanup function to unmount the widget and clean up event listeners

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

## Artifact Fetching

The SDK supports fetching chat artifacts (like doctor profiles) that are referenced in messages. Artifacts are automatically cached and can be fetched using the `getArtifact` method:

```ts
// Fetch an artifact by ID
const artifact = await client.getArtifact<DoctorProfileArtifact>(
  "artifact-id-here"
);

if (artifact) {
  console.log("Artifact type:", artifact.item_type);
  console.log("Content:", artifact.item_content);
}
```

**Note:** Artifact fetching requires authenticated mode (`idTokenProvider` and `tokenExchange` configuration). The SDK uses the `apiBaseUrl` configuration option (defaults to `"https://api.sunnyhealthai-staging.com"`) to construct artifact fetch URLs.

Artifacts are automatically cached, so subsequent calls with the same artifact ID will return the cached result without making another network request.

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
  Auth0Provider,
  PasswordlessAuthManager, // Class, not a type
  type ConversationState,
  type SunnyAgentMessage,
  type SunnyAgentsConfig,
  type UnifiedSunnyChatOptions, // Unified config type
  type AuthConfig, // Discriminated union: SamlOidcAuthConfig | TokenExchangeAuthConfig
  type SamlOidcAuthConfig, // SAML/OIDC auth configuration
  type TokenExchangeAuthConfig, // Token exchange auth configuration
  type SendMessageOptions,
  type SunnyAgentsClientSnapshot,
  type ChatArtifact,
  type DoctorProfileArtifact,
  type ProviderSearchResultsArtifact, // Provider search results artifact
  type ProviderResult, // Individual provider result
  type LocationResult, // Provider location result
  type VanillaChatOptions,
  type VanillaChatInstance,
  type VanillaChatColors,
  type Auth0ProviderConfig,
  type Auth0PopupOptions, // Popup window options for Auth0
  type PasswordlessAuthConfig, // Passwordless auth configuration
  type PasswordlessStartOptions, // Options for starting passwordless login
  type PasswordlessVerifyOptions, // Options for verifying OTP code
  type PasswordlessAuthState, // Current passwordless auth state
} from "@sunnyhealthai/agents-sdk";

// Internal APIs (exported for advanced use cases but not recommended for most users)
import {
  LLMWebSocketManager, // Internal - WebSocket manager
  TokenExchangeManager, // Internal - Token exchange manager
  exchangeIdTokenForAccessToken, // Internal - Direct token exchange function
  type LLMWebSocketConfig, // Internal - WebSocket configuration
  type TokenExchangeConfig, // Internal - Token exchange configuration
  type TokenExchangeResponse, // Internal - Token exchange response
} from "@sunnyhealthai/agents-sdk";
```
