import { LLMWebSocketManager } from './llmWebSocket';
import type {
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
  old_conversation_id?: string;
  new_conversation_id?: string;
  conversation?: any;
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

/**
 * Chat client: keeps **conversation** state in memory for the lifetime of this instance (same browser tab).
 * When the WebSocket drops, the transport may use a new server **session**; the same `conversation_id` is still
 * used for the next `sendMessage` so the user can continue the same thread after reconnect.
 */
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
  private createServerConversations: boolean;
  private readonly serverCreatedConversations = new Set<string>();
  private readonly conversationCreationPromises = new Map<string, Promise<string>>();
  /** Pending conversation creations keyed by request_id for correlation with conversation.created */
  private readonly pendingConversationCreations = new Map<
    string,
    { resolve: (id: string) => void; reject: (err: Error) => void; localId: string }
  >();
  /** Fallback queue when server doesn't echo request_id: resolves in FIFO order */
  private readonly pendingConversationCreationQueue: Array<{
    requestId: string;
    resolve: (id: string) => void;
    reject: (err: Error) => void;
    localId: string;
  }> = [];
  private readonly migratedConversationIds = new Map<string, string>(); // Maps old ID -> new ID

  constructor(private readonly config: SunnyAgentsConfig = {}) {
    // Use provided wsManager or create a new one
    this.ws = config.wsManager ?? new LLMWebSocketManager({
      websocketUrl: config.websocketUrl,
      sessionStorageKey: config.sessionStorageKey,
      idTokenProvider: config.idTokenProvider,
      tokenExchange: config.tokenExchange,
      partnerName: config.partnerName ?? config.tokenExchange?.partnerName,
    });

    // Default to server-created conversations only when we have an ID token provider.
    this.createServerConversations =
      typeof config.createServerConversations === 'boolean'
        ? config.createServerConversations
        : !!(config.idTokenProvider && config.tokenExchange);

    this.ws.onMessage(this.handleMessage);
    this.ws.onConnectionClose(() => {
      this.finalizeInterruptedStreams();
    });

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
      })),
      activeConversationId: this.activeConversationId,
    };
  }

  setActiveConversation(conversationId: string | null) {
    this.activeConversationId = conversationId;
    this.notify();
  }

  /**
   * Toggle whether conversations should be created on the server before sending messages.
   * Used by createSunnyChat to update the flag when auth type changes at runtime.
   */
  setCreateServerConversations(value: boolean): void {
    this.createServerConversations = value;
  }

  /**
   * Updates the ID token provider for authentication.
   * This allows updating authentication after the client has been initialized.
   */
  setIdTokenProvider(provider: (() => Promise<string | null>) | undefined) {
    if (provider) {
      this.ws.setIdTokenProvider(provider);
      // If we have token exchange config, it will be handled by the ws manager
    } else {
      // Clear the token provider by providing a function that returns null
      this.ws.setIdTokenProvider(async () => null);
    }
  }

  private async ensureConnectionAndAuth(): Promise<void> {
    try {
      await this.ws.connect();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
      console.error('[SunnyAgentsClient] Failed to connect WebSocket:', errorMessage);
      throw new Error(`Failed to connect to chat service: ${errorMessage}`);
    }

    // Wait for SDK session to be established on the backend before sending messages
    if (this.config.publicKey) {
      await this.ws.waitForSdkSession();
    }

    // Attempt auth upgrade if a token provider is configured (any auth type).
    // This is idempotent - if already authenticated, it will return early.
    await this.ws.upgradeAuthIfPossible({
      migrateHistory: true,
      profileSync: this.config.authUpgradeProfileSync,
    }).catch((err) => {
      console.warn('[SunnyAgentsClient] Auth upgrade failed, continuing as anonymous:', err);
    });
  }

  async sendMessage(message: string, options?: SendMessageOptions): Promise<{ conversationId: string }> {
    let conversationId = this.ensureConversation(options?.conversationId, options?.title);
    
    // Log for debugging migration issues
    if (options?.conversationId && options.conversationId !== conversationId) {
      console.log('[SunnyAgentsClient] Resolved migrated conversation ID:', { 
        original: options.conversationId, 
        resolved: conversationId 
      });
    }

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

    // Ensure connection and auth before sending
    await this.ensureConnectionAndAuth();

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
    
    // Ensure connection and auth before sending
    await this.ensureConnectionAndAuth();
    
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

      const requestId = randomId('conv');
      const creationPromise = (async () => {
        try {
          await this.ensureConnectionAndAuth();
          const pending: { resolve: (id: string) => void; reject: (err: Error) => void; localId: string } = {
            resolve: () => {},
            reject: () => {},
            localId: id,
          };
          const innerPromise = new Promise<string>((resolve, reject) => {
            pending.resolve = resolve;
            pending.reject = reject;
          });

          this.pendingConversationCreations.set(requestId, pending);
          this.pendingConversationCreationQueue.push({
            requestId,
            resolve: pending.resolve,
            reject: pending.reject,
            localId: id,
          });

          const timeout = setTimeout(() => {
            const entry = this.pendingConversationCreations.get(requestId);
            if (entry) {
              this.pendingConversationCreations.delete(requestId);
              const idx = this.pendingConversationCreationQueue.findIndex((e) => e.requestId === requestId);
              if (idx >= 0) this.pendingConversationCreationQueue.splice(idx, 1);
              entry.resolve(id);
            }
          }, 5000);

          await this.ws.send({
            type: 'conversation.create',
            name: title ?? null,
            request_id: requestId,
          });

          const serverId = await innerPromise;
          clearTimeout(timeout);

          if (serverId !== id) {
            const localConvo = this.conversations.get(id);
            if (localConvo) {
              this.conversations.delete(id);
              this.conversations.set(serverId, { ...localConvo, id: serverId });
            }
            if (this.activeConversationId === id) {
              this.activeConversationId = serverId;
            }
          }

          this.serverCreatedConversations.add(serverId);
          return serverId;
        } catch (error) {
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

  /**
   * Resolves a conversation ID, mapping old migrated IDs to new ones if applicable.
   */
  private resolveConversationId(conversationId: string | null | undefined): string {
    if (!conversationId) {
      return generateUuid();
    }
    // Check if this ID has been migrated to a new ID
    return this.migratedConversationIds.get(conversationId) ?? conversationId;
  }

  private ensureConversation(conversationId?: string | null, title?: string | null): string {
    // Resolve migrated IDs first
    const resolvedId = this.resolveConversationId(conversationId);
    if (!this.conversations.has(resolvedId)) {
      this.conversations.set(resolvedId, {
        id: resolvedId,
        title: title ?? null,
        messages: [],
      });
      this.emit('conversationCreated', { conversationId: resolvedId, title: title ?? null });
    }
    return resolvedId;
  }

  private handleMessage = async (raw: any) => {
    const data = raw as OutputEvent;
    const type = data.type;
    const conversationId = data.conversation_id;

    if (type === 'conversation.migrated') {
      const oldId = data.old_conversation_id;
      const newId = data.new_conversation_id;
      const conversationData = data.conversation;

      console.log('[SunnyAgentsClient] Received conversation.migrated event:', { oldId, newId });

      if (!oldId || !newId) {
        console.warn('[SunnyAgentsClient] conversation.migrated event missing old_conversation_id or new_conversation_id', raw);
        return;
      }

      // Get the existing conversation from the old ID
      const existingConversation = this.conversations.get(oldId);

      if (existingConversation) {
        // Merge conversation data from the event if provided
        const title = conversationData?.title ?? conversationData?.name ?? existingConversation.title ?? null;
        const messages = existingConversation.messages; // Keep existing messages unless backend provides new ones

        // Create new conversation entry with new ID
        const migratedConversation: ConversationState = {
          id: newId,
          title,
          messages,
        };

        // Move conversation from old ID to new ID
        this.conversations.delete(oldId);
        this.conversations.set(newId, migratedConversation);

        // Track the migration mapping so we can resolve old IDs to new ones
        this.migratedConversationIds.set(oldId, newId);

        // Update server-created tracking
        this.serverCreatedConversations.delete(oldId);
        this.serverCreatedConversations.add(newId);

        // Update active conversation ID if it matches the old ID
        if (this.activeConversationId === oldId) {
          this.activeConversationId = newId;
        }

        // Update active stream tracking if old ID exists
        const activeStreamId = this.activeStreamByConversation.get(oldId);
        if (activeStreamId) {
          this.activeStreamByConversation.delete(oldId);
          this.activeStreamByConversation.set(newId, activeStreamId);
        }

        // Update conversation creation promises if old ID exists
        const creationPromise = this.conversationCreationPromises.get(oldId);
        if (creationPromise) {
          this.conversationCreationPromises.delete(oldId);
          this.conversationCreationPromises.set(newId, creationPromise);
        }

        // Emit events
        this.emit('conversationCreated', { conversationId: newId, title });
        if (messages.length > 0) {
          this.emit('messagesUpdated', { conversationId: newId, messages });
        }
        this.notify();
      } else {
        // Conversation doesn't exist locally, but backend migrated it
        // Create a new conversation entry with the new ID
        const title = conversationData?.title ?? conversationData?.name ?? null;
        this.ensureConversation(newId, title ?? undefined);
        this.serverCreatedConversations.add(newId);
        // Track the migration mapping even if conversation didn't exist locally
        this.migratedConversationIds.set(oldId, newId);
        this.emit('conversationCreated', { conversationId: newId, title });
        this.notify();
      }
      return;
    }

    if (type === 'conversation.created') {
      const createdId = (data as any).conversation?.id || conversationId;
      const requestId = (data as any).request_id ?? (data as any).conversation?.request_id;
      const title = (data as any).conversation?.title ?? (data as any).conversation?.name ?? null;

      if (createdId) {
        this.ensureConversation(createdId, title ?? undefined);
        this.serverCreatedConversations.add(createdId);
        if (!this.activeConversationId) {
          this.activeConversationId = createdId;
        }

        let resolved = false;
        if (requestId) {
          const entry = this.pendingConversationCreations.get(requestId);
          if (entry) {
            this.pendingConversationCreations.delete(requestId);
            const idx = this.pendingConversationCreationQueue.findIndex((e) => e.requestId === requestId);
            if (idx >= 0) this.pendingConversationCreationQueue.splice(idx, 1);
            entry.resolve(createdId);
            resolved = true;
          }
        }
        if (!resolved && this.pendingConversationCreationQueue.length > 0) {
          const entry = this.pendingConversationCreationQueue.shift()!;
          this.pendingConversationCreations.delete(entry.requestId);
          entry.resolve(createdId);
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

  /** When the socket closes mid-stream, stop spinner state and keep partial text; conversation id is unchanged. */
  private finalizeInterruptedStreams(): void {
    const pending = [...this.activeStreamByConversation.entries()];
    this.activeStreamByConversation.clear();
    for (const [conversationId, messageId] of pending) {
      const ensuredId = this.ensureConversation(conversationId);
      const conversation = this.conversations.get(ensuredId);
      if (!conversation) continue;
      const existing = this.getMessage(conversation, messageId);
      if (!existing?.isStreaming) continue;
      const finalText = existing.text ?? '';
      this.upsertMessage(conversationId, {
        ...existing,
        id: messageId,
        role: 'assistant',
        text: finalText,
        isStreaming: false,
      });
      this.emit('streamingDone', { conversationId: ensuredId, messageId, text: finalText });
    }
    if (pending.length > 0) {
      this.notify();
    }
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
      next.messages[idx] = { ...next.messages[idx], ...message };
    } else {
      next.messages.push(message);
    }
    this.conversations.set(ensuredId, next);
  }

  private removeMessage(conversationId: string, messageId: string) {
    const ensuredId = this.ensureConversation(conversationId);
    const next = this.conversations.get(ensuredId)!;
    next.messages = next.messages.filter((m) => m.id !== messageId);
    this.conversations.set(ensuredId, next);
  }

  private updateMessage(conversationId: string, messageId: string, updater: (current: SunnyAgentMessage) => SunnyAgentMessage) {
    const ensuredId = this.ensureConversation(conversationId);
    const next = this.conversations.get(ensuredId)!;
    const idx = next.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    next.messages[idx] = updater(next.messages[idx]);
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
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item) continue;
      if (item.type === 'message' || item.type === 'output_message') {
        const fragments = Array.isArray(item.content) ? item.content : [];
        const text = fragments
          .map((fragment) => (fragment && typeof fragment.text === 'string' ? fragment.text : ''))
          .filter(Boolean)
          .join('');
        if (text) return text;
      }
    }
    return fallback ?? '';
  }

  private notify() {
    this.emit('snapshot', this.getSnapshot());
    this.listeners.forEach((listener) => {
      try { listener(); } catch { /* ignore listener errors */ }
    });
  }

  private emit<E extends keyof ClientEventMap>(event: E, payload: ClientEventMap[E]) {
    const set = this.eventListeners.get(event);
    if (!set) return;
    set.forEach((handler) => {
      try { (handler as (p: ClientEventMap[E]) => void)(payload); } catch { /* ignore listener errors */ }
    });
  }
}

