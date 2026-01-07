import { LLMWebSocketManager } from './llmWebSocket';
import type {
  ChatArtifact,
  ConversationState,
  FileAttachment,
  SendMessageOptions,
  SunnyAgentMessage,
  SunnyAgentMessageItem,
  SunnyAgentsClientSnapshot,
  SunnyAgentsConfig,
} from '../types.js';

type Listener = () => void;

type ClientEventMap = {
  snapshot: SunnyAgentsClientSnapshot;
  conversationCreated: { conversationId: string; title: string | null };
  messagesUpdated: { conversationId: string; messages: SunnyAgentMessage[] };
  streamingDelta: { conversationId: string; messageId: string; text: string };
  streamingDone: { conversationId: string; messageId: string; text: string };
  quickResponses: { conversationId: string; quickResponses: string[] };
};

interface ChatPayload {
  type: 'chat';
  conversation_id: string;
  items: Array<InputMessageItem>;
}

type InputMessageItem = UserInputMessageItem | McpApprovalResponseItem;

interface UserInputMessageItem {
  type: 'message';
  role: 'user';
  content: Array<InputTextContent | InputFileContent>;
}

interface McpApprovalResponseItem {
  type: 'mcp_approval_response';
  approval_request_id: string;
  approve: boolean;
  reason?: string | null;
  [key: string]: unknown;
}

interface InputTextContent {
  type: 'input_text';
  text: string;
}

interface InputFileContent {
  type: 'input_file';
  filename: string;
  file_data: string;
  file_id: string | null;
  file_url: string | null;
}

interface OutputEvent {
  type?: string;
  conversation_id?: string;
  message_id?: string;
  role?: string;
  text?: string;
  delta?: string;
  item_id?: string;
  item?: any;
  part?: { type?: string; text?: string };
  responses?: Array<{ text?: string; is_profile_prompt?: boolean }>;
  messages?: Array<any>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback UUID v4-ish
  const hex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

function randomId(prefix: string): string {
  return `${prefix}-${generateUuid()}`;
}

function extractTextFromMessageItem(item: any): string {
  if (!item || !Array.isArray(item.content)) return '';
  return item.content
    .map((c: any) => {
      if (!c) return '';
      if (typeof c.text === 'string') return c.text;
      if (c.type === 'output_text' && typeof c.text === 'string') return c.text;
      return '';
    })
    .filter(Boolean)
    .join('');
}

export class SunnyAgentsClient {
  private readonly ws: LLMWebSocketManager;
  private readonly conversations = new Map<string, ConversationState>();
  private readonly listeners: Set<Listener> = new Set();
  private readonly activeStreamByConversation = new Map<string, string>();
  private readonly eventListeners = new Map<
    keyof ClientEventMap,
    Set<(payload: ClientEventMap[keyof ClientEventMap]) => void>
  >();
  private activeConversationId: string | null = null;
  private readonly createServerConversations: boolean;
  private readonly apiBaseUrl: string;
  private readonly artifactCache = new Map<string, ChatArtifact>();
  private readonly artifactRequestCache = new Map<string, Promise<ChatArtifact | null>>();
  private readonly serverCreatedConversations = new Set<string>();
  private readonly conversationCreationPromises = new Map<string, Promise<string>>();

  constructor(private readonly config: SunnyAgentsConfig = {}) {
    this.ws = new LLMWebSocketManager({
      websocketUrl: config.websocketUrl,
      authorizeUrl: config.authorizeUrl,
      sessionStorageKey: config.sessionStorageKey,
      idTokenProvider: config.idTokenProvider,
      tokenExchange: config.tokenExchange,
      partnerName: config.tokenExchange?.partnerName,
    });
    this.apiBaseUrl = this.resolveApiBaseUrl(config);

    // Default to server-created conversations only when we have an ID token provider.
    this.createServerConversations =
      typeof config.createServerConversations === 'boolean'
        ? config.createServerConversations
        : !!(config.idTokenProvider && config.tokenExchange);

    this.ws.onMessage(this.handleMessage);

    if (config.initialConversationId) {
      this.ensureConversation(config.initialConversationId);
      this.activeConversationId = config.initialConversationId;
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  on<E extends keyof ClientEventMap>(event: E, handler: (payload: ClientEventMap[E]) => void): () => void {
    const set = this.eventListeners.get(event) ?? new Set();
    set.add(handler as any);
    this.eventListeners.set(event, set);
    return () => this.off(event, handler);
  }

  off<E extends keyof ClientEventMap>(event: E, handler: (payload: ClientEventMap[E]) => void): void {
    const set = this.eventListeners.get(event);
    set?.delete(handler as any);
  }

  getSnapshot(): SunnyAgentsClientSnapshot {
    return {
      conversations: Array.from(this.conversations.values()).map((c) => ({
        ...c,
        messages: [...c.messages],
        quickResponses: c.quickResponses ? [...c.quickResponses] : undefined,
      })),
      activeConversationId: this.activeConversationId,
    };
  }

  setActiveConversation(conversationId: string | null) {
    this.activeConversationId = conversationId;
    this.notify();
  }

  async sendMessage(message: string, options?: SendMessageOptions): Promise<{ conversationId: string }> {
    let conversationId = this.ensureConversation(options?.conversationId, options?.title);

    // In authenticated mode, ensure the conversation exists on the server before sending
    if (this.createServerConversations && !this.serverCreatedConversations.has(conversationId)) {
      // Create conversation on server first - this may return a different ID if server generates one
      const serverConversationId = await this.createConversation(options?.title ?? null, conversationId);
      // Use the server-provided ID (which may differ from our local ID)
      conversationId = serverConversationId;
      this.activeConversationId = conversationId;
    } else {
      this.activeConversationId = conversationId;
    }

    // Add the user message locally
    this.appendMessage(conversationId, {
      id: randomId('user'),
      role: 'user',
      text: message,
      createdAt: nowIso(),
      isStreaming: false,
      outputItems: undefined,
    });

    // Prepare a streaming assistant placeholder so UI renders immediately
    const streamingId = randomId('assistant');
    this.activeStreamByConversation.set(conversationId, streamingId);
    this.appendMessage(conversationId, {
      id: streamingId,
      role: 'assistant',
      text: '',
      createdAt: nowIso(),
      isStreaming: true,
      outputItems: [],
    });

    const payload: ChatPayload = {
      type: 'chat',
      conversation_id: conversationId,
      items: [this.buildUserMessageItem(message, options?.files)],
    };

    await this.ws.send(payload);
    options?.onMessageCreated?.(streamingId);
    this.notify();

    return { conversationId };
  }

  async sendMcpApproval(conversationId: string, approvalRequestId: string, approve: boolean, reason?: string | null): Promise<void> {
    const ensuredId = this.ensureConversation(conversationId);
    const responseItem: McpApprovalResponseItem = {
      type: 'mcp_approval_response',
      approval_request_id: approvalRequestId,
      approve,
      reason: reason ?? null,
    };

    const payload: ChatPayload = {
      type: 'chat',
      conversation_id: ensuredId,
      items: [responseItem],
    };

    await this.ws.send(payload);

    this.appendMessage(ensuredId, {
      id: randomId('user'),
      role: 'user',
      text: '',
      createdAt: nowIso(),
      isStreaming: false,
      outputItems: [responseItem],
    });
    this.notify();
  }

  async createConversation(title?: string | null, conversationId?: string | null): Promise<string> {
    const id = conversationId ?? this.ensureConversation(null, title ?? undefined);
    this.ensureConversation(id, title ?? undefined);

    // Only hit the server when explicitly allowed and authenticated.
    if (this.createServerConversations) {
      // If we're already waiting for this conversation to be created, return that promise
      const existingPromise = this.conversationCreationPromises.get(id);
      if (existingPromise) {
        return existingPromise;
      }

      // Create a promise that resolves when the conversation is created on the server
      const creationPromise = (async () => {
        try {
          await this.ws.connect();
          // If we're configured for server conversations, attempt to create on server
          // The server will handle authentication - if we're anonymous, it will fail gracefully
          // Don't send conversation_id - server generates its own ID
          // The server will return the ID in conversation.created event
          await this.ws.send({ type: 'conversation.create', name: title ?? null });
          
          // Wait for conversation.created event (with timeout)
          const serverId = await new Promise<string>((resolve, reject) => {
            const timeout = setTimeout(() => {
              // Timeout: server didn't respond in time
              // If we provided an ID, assume it failed and we should use server-generated
              // For now, reject to indicate creation didn't complete
              cleanup();
              // Actually, let's resolve with the local ID and mark it - the server might have created it
              // but the event was delayed. The sendMessage will handle the error if it doesn't exist.
              resolve(id);
            }, 5000); // 5 second timeout
            
            const handler = (payload: ClientEventMap['conversationCreated']) => {
              const createdId = payload.conversationId;
              cleanup();
              resolve(createdId);
            };
            
            const cleanup = () => {
              clearTimeout(timeout);
              this.off('conversationCreated', handler);
            };
            
            this.on('conversationCreated', handler);
          });
          
          // Server returned an ID - use it (may differ from our local ID)
          // Update local conversation if IDs differ
          if (serverId !== id) {
            const localConvo = this.conversations.get(id);
            if (localConvo) {
              // Move conversation to server ID
              this.conversations.delete(id);
              this.conversations.set(serverId, { ...localConvo, id: serverId });
            }
            // Update active conversation if it was the one we just created
            if (this.activeConversationId === id) {
              this.activeConversationId = serverId;
            }
          }
          
          // Mark as server-created (will be confirmed by conversation.created event handler too)
          this.serverCreatedConversations.add(serverId);
          return serverId;
        } catch (error) {
          // If connection/auth fails, stay local-only.
          // Return local ID so the conversation can still be used locally
          return id;
        }
      })();
      
      this.conversationCreationPromises.set(id, creationPromise);
      
      try {
        const result = await creationPromise;
        this.conversationCreationPromises.delete(id);
        return result;
      } catch (error) {
        this.conversationCreationPromises.delete(id);
        throw error;
      }
    }

    this.notify();
    return id;
  }

  private buildUserMessageItem(message: string, files?: FileAttachment[]): InputMessageItem {
    const content: Array<InputTextContent | InputFileContent> = [
      { type: 'input_text', text: message },
    ];

    if (files?.length) {
      for (const file of files) {
        content.push({
          type: 'input_file',
          filename: file.filename,
          file_data: file.content,
          file_id: null,
          file_url: null,
        });
      }
    }

    return {
      type: 'message',
      role: 'user',
      content,
    };
  }

  private ensureConversation(conversationId?: string | null, title?: string | null): string {
    const id = conversationId ?? generateUuid();
    if (!this.conversations.has(id)) {
      this.conversations.set(id, {
        id,
        title: title ?? null,
        messages: [],
        quickResponses: [],
      });
      this.emit('conversationCreated', { conversationId: id, title: title ?? null });
    }
    return id;
  }

  private handleMessage = async (raw: any) => {
    const data = raw as OutputEvent;
    const type = data.type;
    const conversationId = data.conversation_id;

    if (type === 'conversation.created') {
      const createdId = (raw as any).conversation?.id || (raw as any).conversation_id || conversationId;
      if (createdId) {
        const title = (raw as any).conversation?.title || (raw as any).title || null;
        this.ensureConversation(createdId, title ?? undefined);
        this.serverCreatedConversations.add(createdId);
        if (!this.activeConversationId) {
          this.activeConversationId = createdId;
        }
        this.emit('conversationCreated', { conversationId: createdId, title: title ?? null });
        this.notify();
      }
      return;
    }

    if (type === 'conversation.messages' && conversationId) {
      const incoming = Array.isArray(data.messages) ? data.messages : [];
      const mapped = incoming.map((msg) => {
        const role = (msg.role || msg.message_role || 'assistant') as SunnyAgentMessage['role'];
        const contentArray = Array.isArray(msg.content) ? (msg.content as SunnyAgentMessageItem[]) : undefined;
        const fallbackText =
          msg.message ||
          msg.text ||
          (Array.isArray(msg.content)
            ? msg.content.map((c: any) => c?.text || '').join('')
            : '');
        const text = this.extractTextFromContent(contentArray, fallbackText);
        return {
          id: String(msg.id || msg.message_id || randomId('msg')),
          role,
          text,
          createdAt: msg.created_at || nowIso(),
          isStreaming: false,
          outputItems: contentArray,
          feedback: typeof msg.feedback === 'boolean' ? msg.feedback : null,
        } as SunnyAgentMessage;
      });
      const ensuredId = this.ensureConversation(conversationId);
      // Mark as server-created since we received messages from server
      this.serverCreatedConversations.add(ensuredId);
      const base = this.conversations.get(ensuredId)!;
      this.conversations.set(ensuredId, {
        ...base,
        messages: mapped,
      });
      this.emit('messagesUpdated', { conversationId: ensuredId, messages: mapped });
      this.notify();
      return;
    }

    if (type === 'chat.quick_responses' && conversationId) {
      const responses = Array.isArray(data.responses)
        ? (data.responses.map((r) => r?.text).filter(Boolean) as string[])
        : [];
      const ensuredId = this.ensureConversation(conversationId);
      const next = this.conversations.get(ensuredId)!;
      next.quickResponses = responses;
      this.conversations.set(ensuredId, { ...next });
      this.emit('quickResponses', { conversationId: ensuredId, quickResponses: responses });
      this.notify();
      return;
    }

    if (type === 'chat.message.started' && conversationId && data.role === 'assistant') {
      const msgId = data.message_id || randomId('assistant');
      const prevId = this.activeStreamByConversation.get(conversationId);
      this.activeStreamByConversation.set(conversationId, msgId);

      // If we already had a streaming placeholder with a different id, drop it to avoid duplicates.
      if (prevId && prevId !== msgId) {
        this.removeMessage(conversationId, prevId);
      }

      this.upsertMessage(conversationId, {
        id: msgId,
        role: 'assistant',
        text: '',
        createdAt: nowIso(),
        isStreaming: true,
      });
      this.notify();
      return;
    }

    if (type === 'response.output_item.added' && conversationId) {
      this.attachOutputItem(conversationId, this.activeStreamByConversation.get(conversationId), (data as any).item);
      this.notify();
      return;
    }

    if (!conversationId) return;

    // Final message item, ensure we consolidate to a single message instance.
    if (type === 'response.output_item.done' && conversationId) {
      const item = (data as any).item;
      if (item?.type === 'message') {
        const msgId = item.id || data.item_id || randomId('assistant');
        const text = extractTextFromMessageItem(item);

        // Remove any previous streaming placeholder with different id
        const prevId = this.activeStreamByConversation.get(conversationId);
        if (prevId && prevId !== msgId) {
          this.removeMessage(conversationId, prevId);
        }

        this.activeStreamByConversation.set(conversationId, msgId);
        this.upsertMessage(conversationId, {
          id: msgId,
          role: 'assistant',
          text,
          createdAt: nowIso(),
          isStreaming: false,
        });
        this.attachOutputItem(conversationId, msgId, item);
        this.activeStreamByConversation.delete(conversationId);
        this.emit('streamingDone', { conversationId, messageId: msgId, text });
        this.notify();
        return;
      }

      this.attachOutputItem(conversationId, this.activeStreamByConversation.get(conversationId), item);
      this.notify();
      return;
    }

    if (type === 'response.output_text.delta') {
      this.updateStreamingMessage(conversationId, data.delta ?? '');
      return;
    }

    if (type === 'response.output_text.done') {
      this.finishStreamingMessage(conversationId, data.text ?? '');
      return;
    }

    if (type === 'response.content_part.done') {
      const text = data.part?.text ?? '';
      if (text) {
        this.finishStreamingMessage(conversationId, text);
      }
      return;
    }
  };

  private updateStreamingMessage(conversationId: string, delta: string) {
    const msgId = this.activeStreamByConversation.get(conversationId) ?? randomId('assistant');
    const ensuredId = this.ensureConversation(conversationId);
    const conversation = this.conversations.get(ensuredId)!;
    const existing = this.getMessage(conversation, msgId);
    const nextText = (existing?.text ?? '') + delta;
    this.upsertMessage(conversationId, {
      id: msgId,
      role: 'assistant',
      text: nextText,
      createdAt: existing?.createdAt ?? nowIso(),
      isStreaming: true,
    });
    this.activeStreamByConversation.set(conversationId, msgId);
    this.emit('streamingDelta', { conversationId: ensuredId, messageId: msgId, text: nextText });
    this.notify();
  }

  private finishStreamingMessage(conversationId: string, text: string) {
    const msgId = this.activeStreamByConversation.get(conversationId) ?? randomId('assistant');
    const ensuredId = this.ensureConversation(conversationId);
    const conversation = this.conversations.get(ensuredId)!;
    const existing = this.getMessage(conversation, msgId);
    const finalText = text || existing?.text || '';
    this.upsertMessage(conversationId, {
      id: msgId,
      role: 'assistant',
      text: finalText,
      createdAt: existing?.createdAt ?? nowIso(),
      isStreaming: false,
    });
    this.emit('streamingDone', { conversationId: ensuredId, messageId: msgId, text: finalText });
    this.notify();
  }

  private getMessage(conversation: ConversationState, id: string): SunnyAgentMessage | undefined {
    return conversation.messages.find((m) => m.id === id);
  }

  private appendMessage(conversationId: string, message: SunnyAgentMessage) {
    const ensuredId = this.ensureConversation(conversationId);
    const next = this.conversations.get(ensuredId)!;
    next.messages = [...next.messages, message];
    this.conversations.set(ensuredId, next);
  }

  private upsertMessage(conversationId: string, message: SunnyAgentMessage) {
    const ensuredId = this.ensureConversation(conversationId);
    const next = this.conversations.get(ensuredId)!;
    const idx = next.messages.findIndex((m) => m.id === message.id);
    if (idx >= 0) {
      next.messages = [
        ...next.messages.slice(0, idx),
        { ...next.messages[idx], ...message },
        ...next.messages.slice(idx + 1),
      ];
    } else {
      next.messages = [...next.messages, message];
    }
    this.conversations.set(ensuredId, next);
  }

  private removeMessage(conversationId: string, messageId: string) {
    const ensuredId = this.ensureConversation(conversationId);
    const next = this.conversations.get(ensuredId)!;
    next.messages = next.messages.filter((m) => m.id !== messageId);
    this.conversations.set(ensuredId, next);
  }

  async getArtifact<T = unknown>(artifactId: string): Promise<ChatArtifact<T> | null> {
    if (!artifactId) return null;
    if (this.artifactCache.has(artifactId)) {
      return this.artifactCache.get(artifactId) as ChatArtifact<T>;
    }
    if (this.artifactRequestCache.has(artifactId)) {
      return this.artifactRequestCache.get(artifactId) as Promise<ChatArtifact<T> | null>;
    }
    const request = this.fetchArtifact<T>(artifactId)
      .then((artifact) => {
        if (artifact) {
          this.artifactCache.set(artifactId, artifact as ChatArtifact);
        }
        return artifact;
      })
      .finally(() => {
        this.artifactRequestCache.delete(artifactId);
      });
    this.artifactRequestCache.set(artifactId, request as Promise<ChatArtifact | null>);
    return request;
  }

  private async fetchArtifact<T = unknown>(artifactId: string): Promise<ChatArtifact<T> | null> {
    if (!this.config.idTokenProvider || !this.config.tokenExchange) {
      throw new Error('An idTokenProvider and tokenExchange config are required to fetch artifacts.');
    }
    
    // Use the WebSocket manager's token exchange to get an access token
    const token = await this.ws.getAccessToken();
    if (!token) {
      throw new Error('Unable to fetch artifact without an access token.');
    }
    
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    if (this.config.tokenExchange?.partnerName) {
      headers['x-sunny-partner-identifier'] = this.config.tokenExchange.partnerName;
    }

    const response = await fetch(`${this.apiBaseUrl}/v1/chat-artifacts/${artifactId}`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      throw new Error(`Artifact request failed: ${response.status}`);
    }
    return (await response.json()) as ChatArtifact<T>;
  }

  private updateMessage(conversationId: string, messageId: string, updater: (current: SunnyAgentMessage) => SunnyAgentMessage) {
    const ensuredId = this.ensureConversation(conversationId);
    const next = this.conversations.get(ensuredId)!;
    const idx = next.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const updated = updater(next.messages[idx]);
    next.messages = [
      ...next.messages.slice(0, idx),
      updated,
      ...next.messages.slice(idx + 1),
    ];
    this.conversations.set(ensuredId, next);
  }

  private mergeOutputItems(existing: SunnyAgentMessageItem[] | undefined, incoming: SunnyAgentMessageItem): SunnyAgentMessageItem[] {
    if (!incoming) return existing ?? [];
    const list = existing ? [...existing] : [];
    if (incoming.id) {
      const idx = list.findIndex((item) => item?.id === incoming.id);
      if (idx >= 0) {
        list[idx] = { ...(list[idx] ?? {}), ...incoming };
        return list;
      }
    }
    list.push(incoming);
    return list;
  }

  private attachOutputItem(conversationId: string, messageId: string | undefined | null, rawItem: any) {
    if (!messageId || !rawItem) return;
    this.updateMessage(conversationId, messageId, (current) => ({
      ...current,
      outputItems: this.mergeOutputItems(current.outputItems, rawItem as SunnyAgentMessageItem),
    }));
  }

  private extractTextFromContent(items?: SunnyAgentMessageItem[], fallback?: string): string {
    if (!items || items.length === 0) return fallback ?? '';
    const collected: string[] = [];
    for (const item of items) {
      if (!item) continue;
      if (item.type === 'message' || item.type === 'output_message') {
        const fragments = Array.isArray(item.content) ? item.content : [];
        const text = fragments
          .map((fragment) => (fragment && typeof fragment.text === 'string' ? fragment.text : ''))
          .filter(Boolean)
          .join('');
        if (text) {
          collected.push(text);
        }
      }
    }
    if (collected.length > 0) {
      return collected[collected.length - 1];
    }
    return fallback ?? '';
  }

  private notify() {
    this.emit('snapshot', this.getSnapshot());
    this.listeners.forEach((listener) => {
      try { listener(); } catch { /* ignore listener errors */ }
    });
  }

  private shouldCreateServerConversations(): boolean {
    // Check config flag. The actual anonymous check happens in createConversation after connecting.
    return this.createServerConversations;
  }

  private resolveApiBaseUrl(config: SunnyAgentsConfig = {}): string {
    if (config.apiBaseUrl) {
      return config.apiBaseUrl.replace(/\/$/, '');
    }
    // Default to api.sunnyhealthai-staging.com for artifact endpoints
    return 'https://api.sunnyhealthai-staging.com';
  }

  private emit<E extends keyof ClientEventMap>(event: E, payload: ClientEventMap[E]) {
    const set = this.eventListeners.get(event);
    if (!set) return;
    set.forEach((handler) => {
      try { (handler as (p: ClientEventMap[E]) => void)(payload); } catch { /* ignore listener errors */ }
    });
  }
}

