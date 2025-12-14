# @sunnyhealthai/agents-sdk

Drop the Sunny chat experience into any React application. The SDK mirrors the websocket flow used by the `asksunny` app: it creates conversations over the LLM gateway websocket, streams assistant text deltas, and exposes a ready-to-use chat component.

## Quick start (headless)

```ts
import { SunnyAgentsClient } from "@sunnyhealthai/agents-sdk";

const client = new SunnyAgentsClient({
  websocketUrl: "wss://llm.sunnyhealth.live",
  authorizeUrl: "https://llm.sunnyhealth.live/authorize",
  tokenProvider: async () => localStorage.getItem("access_token"),
  // For anonymous mode: createServerConversations: false
});

// Subscribe to event stream
const offSnapshot = client.on("snapshot", (snap) =>
  console.log("snapshot", snap)
);
const offDelta = client.on("streamingDelta", ({ conversationId, text }) =>
  console.log("delta", conversationId, text)
);

await client.sendMessage("Hello, Sunny!");
```

### Core API (headless)

- `SunnyAgentsClient`: headless websocket client with:
  - `on(event, handler) / off(event, handler)` for `snapshot`, `conversationCreated`, `messagesUpdated`, `streamingDelta`, `streamingDone`, `quickResponses`.
  - `getSnapshot()` to pull current state.
  - `sendMessage(text, options)` to send/stream messages.
  - `createConversation(title?)` to create explicitly.
  - `subscribe(fn)` if you prefer a single change hook.
  - `createServerConversations` config flag (defaults to true when a tokenProvider is supplied; set to false for anonymous/local-only conversations).

There are no React dependencies in this package. Bring your own UI/framework.

## Drop-in vanilla UI

If you want a ready-made UI without React, mount the vanilla widget:

```html
<div id="sunny-chat" style="height: 520px;"></div>
<script type="module">
  import { attachSunnyChat } from "@sunnyhealthai/agents-sdk";

  attachSunnyChat({
    container: document.getElementById("sunny-chat"),
    config: {
      websocketUrl: "wss://llm.sunnyhealth.live",
      authorizeUrl: "https://llm.sunnyhealth.live/authorize",
      tokenProvider: async () => localStorage.getItem("access_token"),
    },
    headerTitle: "Sunny Agents",
    placeholder: "Ask anything…",
    // If anonymous: set anonymous: true or pass config.createServerConversations: false
  });
</script>
```

`attachSunnyChat` returns `{ client, destroy }` so you can dispose the widget when unmounting a page or SPA view.

### Notes

- The SDK streams assistant responses using the same `response.output_text.*` events emitted by the backend. Additional event types are ignored but can be handled by extending `SunnyAgentsClient`.
- File uploads accept base64 payloads via `files` in `sendMessage`.
- The package targets browser runtimes; run `npm run build` (or rely on the `prepublishOnly` hook) to emit `dist/` before publishing to your private registry.

## Example project

A Vite-powered demo lives under `examples/vanilla-chat` so you can experiment with the SDK in a real browser shell.

1. `cd examples/vanilla-chat`
2. `npm install`
3. (Optional) create `.env.local` with overrides for the backend:
   ```
   VITE_SUNNY_WS_URL=wss://chat.api.sunnyhealthai.com
   VITE_SUNNY_AUTHORIZE_URL=https://chat.api.sunnyhealthai.com/authorize
   VITE_SUNNY_ACCESS_TOKEN=sk-live-***
   ```
4. `npm run dev`

The page includes a token form that persists credentials in `localStorage`, so you can test both anonymous and authenticated chat flows without leaving the browser.
