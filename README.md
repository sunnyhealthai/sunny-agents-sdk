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
      websocketUrl: "wss://chat.api.sunnyhealthai.com",
      authorizeUrl: "https://chat.api.sunnyhealthai.com/authorize",
      tokenProvider: async () => localStorage.getItem("access_token"),
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
  websocketUrl: "wss://chat.api.sunnyhealthai.com",
  authorizeUrl: "https://chat.api.sunnyhealthai.com/authorize",
  tokenProvider: async () => localStorage.getItem("access_token"),
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

When using authenticated mode, provide a `tokenProvider` function that returns an access token:

```ts
const client = new SunnyAgentsClient({
  websocketUrl: "wss://chat.api.sunnyhealthai.com",
  authorizeUrl: "https://chat.api.sunnyhealthai.com/authorize",
  tokenProvider: async () => {
    // Return your access token
    return localStorage.getItem("access_token");
  },
});
```

### Anonymous Mode

For anonymous/local-only conversations, disable server conversation creation:

```ts
const client = new SunnyAgentsClient({
  websocketUrl: "wss://chat.api.sunnyhealthai.com",
  authorizeUrl: "https://chat.api.sunnyhealthai.com/authorize",
  createServerConversations: false, // Anonymous mode
});
```

Or with the vanilla widget:

```ts
attachSunnyChat({
  container: document.getElementById("sunny-chat"),
  config: {
    websocketUrl: "wss://chat.api.sunnyhealthai.com",
    authorizeUrl: "https://chat.api.sunnyhealthai.com/authorize",
    createServerConversations: false,
  },
  anonymous: true, // Alternative way to enable anonymous mode
});
```

## API Reference

### SunnyAgentsClient

The headless client for building custom chat UIs.

#### Methods

- **`sendMessage(text: string, options?: SendMessageOptions)`**: Send a message and stream the response

  - `options.conversationId`: Target conversation (defaults to active conversation)
  - `options.title`: Set conversation title
  - `options.files`: Array of file attachments (base64 encoded)
  - `options.onMessageCreated`: Callback when message is created

- **`createConversation(title?: string)`**: Create a new conversation

- **`getSnapshot()`**: Get current state snapshot

- **`on(event, handler)`**: Subscribe to events
- **`off(event, handler)`**: Unsubscribe from events

- **`subscribe(fn)`**: Subscribe to all state changes with a single callback

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
- `config`: SunnyAgentsConfig (same as SunnyAgentsClient)
- `headerTitle`: Title displayed in the chat header
- `placeholder`: Input placeholder text
- `anonymous`: Enable anonymous mode (alternative to `config.createServerConversations: false`)
- `conversationStorageKey`: localStorage key for persisting conversation ID (default: `"sunny_agents_conversation_id"`)
- `colors`: Custom theme colors (`primary`, `secondary`, `accent`)

#### Returns

- `client`: The underlying SunnyAgentsClient instance
- `destroy()`: Cleanup function to unmount the widget

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

## Framework Integration

This SDK has no framework dependencies. You can use it with:

- **React**: Use the headless client and build your own UI components
- **Vue**: Use the headless client with Vue's reactivity system
- **Vanilla JavaScript**: Use either the headless client or the `attachSunnyChat` widget
- **Any other framework**: The headless client works with any framework

## TypeScript Support

This package includes full TypeScript definitions. Import types as needed:

```ts
import type {
  SunnyAgentsClient,
  ConversationState,
  SunnyAgentMessage,
  SunnyAgentsConfig,
} from "@sunnyhealthai/agents-sdk";
```
