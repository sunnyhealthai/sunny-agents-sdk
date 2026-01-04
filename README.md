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

### Option 1: Drop-in Chat Widget

The easiest way to get started is with the pre-built chat widget:

```html
<div id="sunny-chat" style="height: 520px;"></div>
<script type="module">
  import { attachSunnyChat } from "@sunnyhealthai/agents-sdk";

  const { client, destroy } = attachSunnyChat({
    container: document.getElementById("sunny-chat"),
    config: {
      websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
      authorizeUrl: "https://chat.api.sunnyhealthai-staging.com/authorize",
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
  websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
  authorizeUrl: "https://chat.api.sunnyhealthai-staging.com/authorize",
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
  websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
  authorizeUrl: "https://chat.api.sunnyhealthai-staging.com/authorize",
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
  websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
  authorizeUrl: "https://chat.api.sunnyhealthai-staging.com/authorize",
  // No idTokenProvider or tokenExchange = anonymous mode
});
```

Or explicitly disable server conversation creation:

```ts
const client = new SunnyAgentsClient({
  websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
  authorizeUrl: "https://chat.api.sunnyhealthai-staging.com/authorize",
  createServerConversations: false, // Explicitly disable server persistence
});
```

With the vanilla widget, you can use the `anonymous` option:

```ts
attachSunnyChat({
  container: document.getElementById("sunny-chat"),
  config: {
    websocketUrl: "wss://chat.api.sunnyhealthai-staging.com",
    authorizeUrl: "https://chat.api.sunnyhealthai-staging.com/authorize",
  },
  anonymous: true, // Enables anonymous mode (same as omitting idTokenProvider)
});
```

**Note:** `createServerConversations` defaults to `true` if both `idTokenProvider` and `tokenExchange` are provided, otherwise `false`. The `anonymous` option in `attachSunnyChat` sets `createServerConversations: false` when no token provider is configured.

## API Reference

### SunnyAgentsClient

The headless client for building custom chat UIs.

#### Constructor Options

```ts
new SunnyAgentsClient(config?: SunnyAgentsConfig)
```

**Configuration Options (`SunnyAgentsConfig`):**

- `websocketUrl?: string` - WebSocket URL for chat connection (defaults to `"wss://chat.api.sunnyhealthai-staging.com"`)
- `authorizeUrl?: string` - Authorization endpoint URL (defaults to `"https://chat.api.sunnyhealthai-staging.com/authorize"`)
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
  SunnyAgentsClient, // Class, not a type
  attachSunnyChat,
  type ConversationState,
  type SunnyAgentMessage,
  type SunnyAgentsConfig,
  type SendMessageOptions,
  type SunnyAgentsClientSnapshot,
  type ChatArtifact,
  type DoctorProfileArtifact,
  type VanillaChatOptions,
  type VanillaChatInstance,
  type VanillaChatColors,
} from "@sunnyhealthai/agents-sdk";
```
