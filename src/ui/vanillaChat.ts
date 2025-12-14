import { SunnyAgentsClient } from '../client/SunnyAgentsClient';
import type {
  DoctorProfileArtifact,
  SunnyAgentMessage,
  SunnyAgentMessageItem,
  SunnyAgentsClientSnapshot,
  SunnyAgentsConfig,
} from '../types';

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
}

export interface VanillaChatOptions {
  container: HTMLElement;
  client?: SunnyAgentsClient;
  config?: SunnyAgentsConfig;
  headerTitle?: string;
  placeholder?: string;
  /**
   * If true, will skip server conversation creation (useful for anonymous flows).
   */
  anonymous?: boolean;
  /**
    * Optional localStorage key to persist/reuse a conversation id for anonymous sessions.
    * Defaults to "sunny_agents_conversation_id".
    */
  conversationStorageKey?: string;
  /**
   * Custom theme colors for the chat UI.
   * Uses CSS custom properties for easy styling.
   */
  colors?: VanillaChatColors;
}

export interface VanillaChatInstance {
  client: SunnyAgentsClient;
  destroy: () => void;
}

const STYLE_ID = 'sunny-agents-vanilla-style';
const ARTIFACT_TAG_START = '{art_tag}';
const ARTIFACT_TAG_END = '{/art_tag}';

type ArtifactSegment = { type: 'text'; value: string } | { type: 'artifact'; id: string };
type ApprovalState = 'approved' | 'rejected';

interface ProviderCardViewModel {
  name: string;
  specialty?: string;
  rating?: number;
  reviewCount?: number;
  location?: string;
  phone?: string;
  languages?: string[];
  estimatedOop?: number;
}

export function attachSunnyChat(options: VanillaChatOptions): VanillaChatInstance {
  const {
    container,
    client: providedClient,
    config,
    headerTitle = 'Sunny Agents',
    placeholder = 'Ask anything…',
    anonymous = false,
    conversationStorageKey = 'sunny_agents_conversation_id',
    colors = {},
  } = options;

  const persistedConversationId = getOrCreateConversationId(conversationStorageKey);

  const client = providedClient ?? new SunnyAgentsClient({
    ...config,
    initialConversationId: config?.initialConversationId ?? persistedConversationId,
    createServerConversations:
      typeof config?.createServerConversations === 'boolean'
        ? config.createServerConversations
        : !anonymous && !!config?.tokenProvider,
  });
  ensureStyles();

  // DOM structure
  const root = document.createElement('div');
  root.className = 'sunny-chat sunny-chat--collapsed';
  
  // Apply custom color properties
  if (colors.primary) root.style.setProperty('--sunny-color-primary', colors.primary);
  if (colors.secondary) root.style.setProperty('--sunny-color-secondary', colors.secondary);
  if (colors.accent) root.style.setProperty('--sunny-color-accent', colors.accent);
  root.innerHTML = `
    <div class="sunny-chat-modal-backdrop" aria-hidden="true">
      <div class="sunny-chat-modal" role="dialog" aria-modal="true">
        <button type="button" class="sunny-chat-modal__close" aria-label="Close chat">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
          </svg>
        </button>
        <div class="sunny-chat__messages" aria-live="polite"></div>
        <div class="sunny-chat-modal__composer">
          <input type="text" class="sunny-chat-modal__input" placeholder="${placeholder}" aria-label="${placeholder}" />
          <button type="button" class="sunny-chat__send-btn" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m22 2-7 20-4-9-9-4 20-7z" stroke-linejoin="round" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
    <div class="sunny-chat__trigger">
      <input type="text" class="sunny-chat__trigger-input" placeholder="${placeholder}" aria-label="${placeholder}" />
      <button type="button" class="sunny-chat__send-btn" aria-label="Send message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m22 2-7 20-4-9-9-4 20-7z" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  `;
  container.appendChild(root);

  const messagesEl = root.querySelector('.sunny-chat__messages') as HTMLElement;
  const modalBackdrop = root.querySelector('.sunny-chat-modal-backdrop') as HTMLElement;
  const modal = root.querySelector('.sunny-chat-modal') as HTMLElement;
  const modalCloseBtn = root.querySelector('.sunny-chat-modal__close') as HTMLButtonElement;
  const modalInput = root.querySelector('.sunny-chat-modal__input') as HTMLInputElement;
  const modalSendBtn = modal.querySelector('.sunny-chat__send-btn') as HTMLButtonElement;
  const triggerContainer = root.querySelector('.sunny-chat__trigger') as HTMLElement;
  const triggerInput = root.querySelector('.sunny-chat__trigger-input') as HTMLInputElement;
  const triggerSendBtn = triggerContainer.querySelector('.sunny-chat__send-btn') as HTMLButtonElement;

  let unsubscribes: Array<() => void> = [];
  let latestSnapshot: SunnyAgentsClientSnapshot | null = null;
  let isExpanded = false;
  let isClosing = false; // Flag to prevent immediate reopen on focus

  const setExpanded = (expanded: boolean) => {
    if (expanded === isExpanded) return;
    isExpanded = expanded;
    root.classList.toggle('sunny-chat--collapsed', !expanded);
    modalBackdrop.classList.toggle('sunny-chat-modal-backdrop--open', expanded);
    modalBackdrop.setAttribute('aria-hidden', String(!expanded));
    
    if (expanded) {
      // Transfer any text from trigger input to modal input
      if (triggerInput.value.trim()) {
        modalInput.value = triggerInput.value;
        triggerInput.value = '';
      }
      // Focus the modal input
      requestAnimationFrame(() => {
        modalInput.focus();
        // Move cursor to end
        modalInput.selectionStart = modalInput.selectionEnd = modalInput.value.length;
      });
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      // Restore body scroll
      document.body.style.overflow = '';
      // Set closing flag to prevent immediate reopen when focus returns to trigger
      isClosing = true;
      triggerInput.blur();
      requestAnimationFrame(() => {
        isClosing = false;
      });
    }
  };

  const closeModal = () => {
    setExpanded(false);
  };

  const render = (snapshot?: SunnyAgentsClientSnapshot) => {
    const snap = snapshot ?? client.getSnapshot();
    latestSnapshot = snap;
    let convo =
      snap.conversations.find((c) => c.id === snap.activeConversationId) ??
      snap.conversations[0];

    // If no conversation exists yet, defer; we'll create one below.
    if (!convo) {
      setExpanded(false);
      return;
    }

    messagesEl.innerHTML = '';
    const approvalStatuses = buildApprovalStatuses(convo.messages);
    for (const msg of convo.messages) {
      const row = document.createElement('div');
      row.className = `sunny-chat__message sunny-chat__message--${msg.role}`;
      const bubble = buildMessageBubble(msg, convo.id, approvalStatuses);
      row.appendChild(bubble);
      messagesEl.appendChild(row);
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
    setExpanded(convo.messages.length > 0);
  };

  const buildMessageBubble = (message: SunnyAgentMessage, conversationId: string, approvals: Map<string, ApprovalState>) => {
    const bubble = document.createElement('div');
    bubble.className = 'sunny-chat__bubble';

    if (message.role === 'assistant') {
      appendAssistantContent(bubble, message);
      const approvalBlock = renderApprovalCards(message, approvals, conversationId);
      if (approvalBlock) {
        bubble.appendChild(approvalBlock);
      }
    } else {
      const paragraph = createParagraph(message.text || (message.isStreaming ? '…' : ''));
      if (paragraph) {
        bubble.appendChild(paragraph);
      }
    }

    return bubble;
  };

  const appendAssistantContent = (container: HTMLElement, message: SunnyAgentMessage) => {
    const baseText = message.text || (message.isStreaming ? '…' : '');
    const segments = splitArtifactSegments(baseText);
    if (!segments.length) {
      const paragraph = createParagraph(baseText);
      if (paragraph) {
        container.appendChild(paragraph);
      }
      return;
    }

    for (const segment of segments) {
      if (segment.type === 'text') {
        const paragraph = createParagraph(segment.value);
        if (paragraph) {
          container.appendChild(paragraph);
        }
      } else if (segment.type === 'artifact') {
        container.appendChild(createProviderCard(segment.id));
      }
    }
  };

  const createParagraph = (text?: string | null) => {
    const trimmed = (text ?? '').trim();
    if (!trimmed) return null;
    const paragraph = document.createElement('p');
    paragraph.textContent = trimmed;
    return paragraph;
  };

  const renderApprovalCards = (message: SunnyAgentMessage, approvals: Map<string, ApprovalState>, conversationId: string) => {
    if (!message.outputItems || !message.outputItems.length) return null;
    const requests = message.outputItems.filter((item) => item?.type === 'mcp_approval_request' && item?.id) as SunnyAgentMessageItem[];
    if (!requests.length) return null;
    const list = document.createElement('div');
    list.className = 'sunny-approval-list';
    for (const request of requests) {
      list.appendChild(createApprovalCard(request, approvals.get(String(request.id)), conversationId));
    }
    return list;
  };

  const createApprovalCard = (request: SunnyAgentMessageItem, status: ApprovalState | undefined, conversationId: string) => {
    const card = document.createElement('div');
    card.className = 'sunny-approval-card';
    if (status) {
      card.classList.add(`sunny-approval-card--${status}`);
    }

    const header = document.createElement('div');
    header.className = 'sunny-approval-card__header';

    const title = document.createElement('div');
    title.className = 'sunny-approval-card__title';
    title.textContent = request.name || 'Tool request';

    const label = document.createElement('div');
    label.className = 'sunny-approval-card__label';
    label.textContent = request.server_label || 'Requires approval';

    const statusBadge = document.createElement('div');
    statusBadge.className = 'sunny-approval-card__status';
    statusBadge.textContent = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Awaiting action';

    header.append(title, label, statusBadge);

    const argumentsBlock = document.createElement('pre');
    argumentsBlock.className = 'sunny-approval-card__arguments';
    argumentsBlock.textContent = formatArguments(request.arguments);

    const actions = document.createElement('div');
    actions.className = 'sunny-approval-card__actions';

    const approveBtn = document.createElement('button');
    approveBtn.type = 'button';
    approveBtn.className = 'sunny-approval-card__btn sunny-approval-card__btn--approve';
    approveBtn.textContent = 'Approve';

    const rejectBtn = document.createElement('button');
    rejectBtn.type = 'button';
    rejectBtn.className = 'sunny-approval-card__btn sunny-approval-card__btn--reject';
    rejectBtn.textContent = 'Reject';

    const errorEl = document.createElement('div');
    errorEl.className = 'sunny-approval-card__error';
    errorEl.hidden = true;

    const setBusy = (busy: boolean) => {
      card.classList.toggle('sunny-approval-card--busy', busy);
      approveBtn.disabled = busy || !!status;
      rejectBtn.disabled = busy || !!status;
    };

    const updateStatus = (next: ApprovalState) => {
      card.classList.remove('sunny-approval-card--approved', 'sunny-approval-card--rejected');
      card.classList.add(`sunny-approval-card--${next}`);
      statusBadge.textContent = next.charAt(0).toUpperCase() + next.slice(1);
    };

    const handleDecision = (approve: boolean) => {
      const requestId = request.id;
      if (!requestId || !conversationId) return;
      setBusy(true);
      errorEl.hidden = true;
      client
        .sendMcpApproval(conversationId, String(requestId), approve)
        .then(() => {
          const nextState: ApprovalState = approve ? 'approved' : 'rejected';
          updateStatus(nextState);
          approveBtn.disabled = true;
          rejectBtn.disabled = true;
        })
        .catch((err) => {
          errorEl.hidden = false;
          errorEl.textContent =
            err instanceof Error ? err.message : 'Unable to submit approval response.';
        })
        .finally(() => {
          setBusy(false);
        });
    };

    approveBtn.addEventListener('click', () => handleDecision(true));
    rejectBtn.addEventListener('click', () => handleDecision(false));

    if (status) {
      approveBtn.disabled = true;
      rejectBtn.disabled = true;
    }

    actions.append(approveBtn, rejectBtn);

    card.append(header, argumentsBlock, errorEl, actions);
    return card;
  };

  const createProviderCard = (artifactId: string) => {
    const card = document.createElement('div');
    card.className = 'sunny-provider-card sunny-provider-card--loading';
    const placeholder = document.createElement('div');
    placeholder.className = 'sunny-provider-card__loading';
    placeholder.textContent = 'Fetching provider details…';
    card.appendChild(placeholder);

    if (!artifactId) {
      card.classList.remove('sunny-provider-card--loading');
      placeholder.textContent = 'Missing provider reference.';
      return card;
    }

    void client
      .getArtifact<DoctorProfileArtifact>(artifactId)
      .then((artifact) => {
        if (!artifact) {
          throw new Error('Provider details are unavailable.');
        }
        const profile = normalizeDoctorProfile(artifact.item_content || (artifact as any).content);
        renderProviderProfile(card, profile);
      })
      .catch((err: unknown) => {
        card.classList.remove('sunny-provider-card--loading');
        card.classList.add('sunny-provider-card--error');
        if (err instanceof Error && /token/i.test(err.message)) {
          placeholder.textContent = 'Sign in required to view provider details.';
        } else {
          placeholder.textContent =
            err instanceof Error ? err.message : 'Unable to load provider details.';
        }
      });

    return card;
  };

  const renderProviderProfile = (card: HTMLElement, profile: ProviderCardViewModel) => {
    card.classList.remove('sunny-provider-card--loading', 'sunny-provider-card--error');
    card.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'sunny-provider-card__header';

    const nameEl = document.createElement('div');
    nameEl.className = 'sunny-provider-card__name';
    nameEl.textContent = profile.name;

    const specialtyEl = document.createElement('div');
    specialtyEl.className = 'sunny-provider-card__specialty';
    specialtyEl.textContent = profile.specialty || 'Provider';

    header.append(nameEl, specialtyEl);

    if (profile.rating) {
      const ratingEl = document.createElement('div');
      ratingEl.className = 'sunny-provider-card__rating';
      const reviewSuffix = profile.reviewCount ? ` • ${profile.reviewCount} reviews` : '';
      ratingEl.textContent = `${profile.rating.toFixed(1)}${reviewSuffix}`;
      header.appendChild(ratingEl);
    }

    const meta = document.createElement('ul');
    meta.className = 'sunny-provider-card__meta';
    addMetaRow(meta, 'Location', profile.location);
    addMetaRow(meta, 'Phone', profile.phone);
    addMetaRow(meta, 'Languages', profile.languages && profile.languages.length ? profile.languages.join(', ') : undefined);
    addMetaRow(meta, 'Estimated cost', profile.estimatedOop !== undefined ? formatCurrency(profile.estimatedOop) : undefined);

    card.append(header);
    if (meta.children.length > 0) {
      card.append(meta);
    }
  };

  const addMetaRow = (list: HTMLElement, label: string, value?: string) => {
    if (!value) return;
    const item = document.createElement('li');
    const labelEl = document.createElement('span');
    labelEl.className = 'sunny-provider-card__meta-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'sunny-provider-card__meta-value';
    valueEl.textContent = value;
    item.append(labelEl, valueEl);
    list.appendChild(item);
  };

  const ensureConversation = async () => {
    const snap = latestSnapshot ?? client.getSnapshot();
    if (snap.conversations.length === 0) {
      const newId = await client.createConversation(headerTitle);
      client.setActiveConversation(newId);
    }
  };

  const send = async () => {
    const text = modalInput.value.trim();
    if (!text) return;
    setExpanded(true);
    await ensureConversation();
    await client.sendMessage(text, { conversationId: persistedConversationId });
    modalInput.value = '';
    render();
  };

  // Modal send button
  const handleModalSendClick = () => { void send(); };
  modalSendBtn.addEventListener('click', handleModalSendClick);

  // Send from trigger input (first message)
  const sendFromTrigger = async () => {
    const text = triggerInput.value.trim();
    if (!text) return;
    // Transfer text to modal and open it
    modalInput.value = text;
    triggerInput.value = '';
    setExpanded(true);
    // Now send the message
    await ensureConversation();
    await client.sendMessage(text, { conversationId: persistedConversationId });
    modalInput.value = '';
    render();
  };

  // Trigger send button: send message and open modal
  const handleTriggerSendClick = () => {
    void sendFromTrigger();
  };
  triggerSendBtn.addEventListener('click', handleTriggerSendClick);

  // Trigger input keydown: send on Enter
  const handleTriggerKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendFromTrigger();
    }
  };
  triggerInput.addEventListener('keydown', handleTriggerKeyDown);

  // Modal input keydown
  const handleModalKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void send();
    }
  };
  modalInput.addEventListener('keydown', handleModalKeyDown);

  // Close button handler
  const handleCloseClick = (e: MouseEvent) => {
    e.stopPropagation();
    closeModal();
  };
  modalCloseBtn.addEventListener('click', handleCloseClick);

  // Stop propagation on modal to prevent backdrop handler from firing
  const handleModalClick = (e: MouseEvent) => {
    e.stopPropagation();
  };
  modal.addEventListener('click', handleModalClick);

  // Backdrop click handler (close when clicking outside modal)
  const handleBackdropClick = () => {
    closeModal();
  };
  modalBackdrop.addEventListener('click', handleBackdropClick);

  // Escape key handler
  const handleEscapeKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isExpanded) {
      e.preventDefault();
      closeModal();
    }
  };
  document.addEventListener('keydown', handleEscapeKey);

  // Subscribe to client events for live updates.
  unsubscribes.push(
    client.on('snapshot', (snap) => render(snap)),
    client.on('streamingDelta', () => render()),
    client.on('streamingDone', () => render()),
  );

  // Kick off render without forcing conversation creation; expand once messages exist
  render();

  const destroy = () => {
    unsubscribes.forEach((fn) => fn());
    unsubscribes = [];
    // Clean up modal event listeners
    modalSendBtn.removeEventListener('click', handleModalSendClick);
    modalCloseBtn.removeEventListener('click', handleCloseClick);
    modal.removeEventListener('click', handleModalClick);
    modalBackdrop.removeEventListener('click', handleBackdropClick);
    modalInput.removeEventListener('keydown', handleModalKeyDown);
    // Clean up trigger event listeners
    triggerInput.removeEventListener('keydown', handleTriggerKeyDown);
    triggerSendBtn.removeEventListener('click', handleTriggerSendClick);
    // Clean up document event listeners
    document.removeEventListener('keydown', handleEscapeKey);
    // Restore body scroll
    document.body.style.overflow = '';
    if (root.parentElement === container) {
      container.removeChild(root);
    }
  };

  return { client, destroy };
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap');

  .sunny-chat {
    /* Theme colors - can be overridden via options */
    --sunny-color-primary: #006fff;
    --sunny-color-secondary: #212124;
    --sunny-color-accent: #22c55e;
    --sunny-color-danger: #ef4444;
    --sunny-color-danger-hover: #dc2626;
    
    /* Neutral palette */
    --sunny-gray-50: #fafbfc;
    --sunny-gray-100: #f6f6f8;
    --sunny-gray-200: #ebebed;
    --sunny-gray-300: #dbdce1;
    --sunny-gray-400: #c4c5cb;
    --sunny-gray-500: #838691;
    --sunny-gray-600: #52535a;
    
    /* Computed color variants */
    --sunny-color-primary-hover: color-mix(in srgb, var(--sunny-color-primary) 90%, black);
    --sunny-color-primary-active: color-mix(in srgb, var(--sunny-color-primary) 80%, black);
    --sunny-color-primary-shadow: color-mix(in srgb, var(--sunny-color-primary) 30%, transparent);
    --sunny-color-primary-ring: color-mix(in srgb, var(--sunny-color-primary) 12%, transparent);
    --sunny-color-accent-hover: color-mix(in srgb, var(--sunny-color-accent) 85%, black);
    --sunny-color-accent-shadow: color-mix(in srgb, var(--sunny-color-accent) 25%, transparent);
    --sunny-color-accent-bg: color-mix(in srgb, var(--sunny-color-accent) 8%, white);
    --sunny-color-danger-shadow: rgba(239, 68, 68, 0.25);
    
    /* Shadows */
    --sunny-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.04);
    --sunny-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.06);
    --sunny-shadow-lg: 0 6px 20px rgba(0, 0, 0, 0.08);
    
    /* Timing */
    --sunny-transition-fast: 120ms ease;
    --sunny-transition-normal: 200ms ease;
    
    font-family: 'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: var(--sunny-color-secondary);
    line-height: 1.5;
  }

  /* Modal Backdrop */
  .sunny-chat-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(33, 33, 36, 0.85);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    opacity: 0;
    visibility: hidden;
    transition: opacity var(--sunny-transition-normal), visibility var(--sunny-transition-normal);
  }
  .sunny-chat-modal-backdrop--open {
    opacity: 1;
    visibility: visible;
  }

  /* Modal Container */
  .sunny-chat-modal {
    position: relative;
    width: 794px;
    max-width: calc(100vw - 32px);
    height: 560px;
    max-height: calc(100vh - 64px);
    background: #fff;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: scale(0.96) translateY(8px);
    opacity: 0;
    transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), opacity var(--sunny-transition-normal);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.04), 0 8px 16px rgba(0, 0, 0, 0.08), 0 24px 48px rgba(0, 0, 0, 0.16);
  }
  .sunny-chat-modal-backdrop--open .sunny-chat-modal {
    transform: scale(1) translateY(0);
    opacity: 1;
  }

  /* Close Button */
  .sunny-chat-modal__close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--sunny-gray-500);
    cursor: pointer;
    display: grid;
    place-items: center;
    z-index: 10;
    transition: background var(--sunny-transition-fast), color var(--sunny-transition-fast);
  }
  .sunny-chat-modal__close:hover {
    background: var(--sunny-gray-100);
    color: var(--sunny-gray-600);
  }
  .sunny-chat-modal__close:active {
    background: var(--sunny-gray-200);
  }
  .sunny-chat-modal__close svg {
    width: 18px;
    height: 18px;
  }

  /* Messages Area */
  .sunny-chat__messages {
    flex: 1;
    overflow-y: auto;
    padding: 48px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: #fff;
  }
  .sunny-chat__messages::-webkit-scrollbar {
    width: 6px;
  }
  .sunny-chat__messages::-webkit-scrollbar-track {
    background: transparent;
  }
  .sunny-chat__messages::-webkit-scrollbar-thumb {
    background: var(--sunny-gray-300);
    border-radius: 3px;
  }
  .sunny-chat__messages::-webkit-scrollbar-thumb:hover {
    background: var(--sunny-gray-400);
  }

  /* Message Bubbles */
  .sunny-chat__message {
    max-width: 85%;
    padding: 14px 18px;
    border-radius: 14px;
    line-height: 1.55;
    font-size: 14px;
  }
  .sunny-chat__message--user {
    align-self: flex-end;
    background: var(--sunny-color-primary);
    color: #fff;
    border-radius: 14px 14px 4px 14px;
    box-shadow: 0 2px 8px var(--sunny-color-primary-shadow);
  }
  .sunny-chat__message--assistant {
    align-self: flex-start;
    background: #fff;
    color: var(--sunny-color-secondary);
    border: 1px solid var(--sunny-gray-200);
    border-radius: 14px 14px 14px 4px;
    box-shadow: var(--sunny-shadow-sm);
  }
  .sunny-chat__bubble {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .sunny-chat__bubble p {
    margin: 0;
    line-height: 1.6;
  }

  /* Shared Input Styles */
  .sunny-chat-modal__input,
  .sunny-chat__trigger-input {
    border: 1px solid var(--sunny-gray-300);
    background: #fff;
    color: var(--sunny-color-secondary);
    font-size: 15px;
    font-family: inherit;
    outline: none;
    transition: border-color var(--sunny-transition-fast), box-shadow var(--sunny-transition-fast);
  }
  .sunny-chat-modal__input:hover,
  .sunny-chat__trigger-input:hover {
    border-color: var(--sunny-gray-400);
  }
  .sunny-chat-modal__input:focus,
  .sunny-chat__trigger-input:focus {
    border-color: var(--sunny-color-primary);
  }
  .sunny-chat-modal__input::placeholder,
  .sunny-chat__trigger-input::placeholder {
    color: var(--sunny-gray-500);
  }

  /* Modal Composer */
  .sunny-chat-modal__composer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px 20px;
    background: #fff;
    border-top: 1px solid var(--sunny-gray-200);
  }
  .sunny-chat-modal__input {
    flex: 1;
    height: 48px;
    padding: 0 20px;
    border-radius: 24px;
  }
  .sunny-chat-modal__input:focus {
    box-shadow: 0 0 0 4px var(--sunny-color-primary-ring);
  }

  /* Trigger Input */
  .sunny-chat__trigger {
    display: flex;
    align-items: center;
    position: relative;
    max-width: 600px;
    margin: 0 auto;
  }
  .sunny-chat__trigger-input {
    width: 100%;
    height: 56px;
    padding: 0 60px 0 24px;
    border-radius: 28px;
    box-shadow: var(--sunny-shadow-md);
    transition: border-color var(--sunny-transition-fast), box-shadow var(--sunny-transition-fast), background var(--sunny-transition-fast);
  }
  .sunny-chat__trigger-input:hover {
    box-shadow: var(--sunny-shadow-lg);
  }
  .sunny-chat__trigger-input:focus {
    box-shadow: 0 0 0 4px var(--sunny-color-primary-ring), var(--sunny-shadow-lg);
  }

  /* Send Button */
  .sunny-chat__send-btn {
    position: absolute;
    right: 8px;
    width: 40px;
    height: 40px;
    padding: 0;
    background: var(--sunny-color-primary);
    color: #fff;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background var(--sunny-transition-fast), transform var(--sunny-transition-fast), box-shadow var(--sunny-transition-fast);
    flex-shrink: 0;
    box-shadow: 0 2px 8px var(--sunny-color-primary-shadow);
  }
  .sunny-chat__send-btn:hover {
    background: var(--sunny-color-primary-hover);
    box-shadow: 0 4px 12px var(--sunny-color-primary-shadow);
  }
  .sunny-chat__send-btn:active {
    transform: scale(0.94);
    background: var(--sunny-color-primary-active);
  }
  .sunny-chat__send-btn svg {
    width: 18px;
    height: 18px;
    transform: translate(-1px, 1px);
  }
  .sunny-chat-modal__composer .sunny-chat__send-btn {
    position: relative;
    right: auto;
  }

  /* Provider Card */
  .sunny-provider-card {
    border: 1px solid var(--sunny-gray-200);
    border-radius: 12px;
    padding: 18px;
    background: #fff;
    box-shadow: var(--sunny-shadow-sm);
  }
  .sunny-provider-card--loading,
  .sunny-approval-card--busy {
    opacity: 0.7;
  }
  .sunny-provider-card__header {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
    margin-bottom: 14px;
  }
  .sunny-provider-card__name {
    font-weight: 700;
    font-size: 16px;
    color: var(--sunny-color-secondary);
  }
  .sunny-provider-card__specialty,
  .sunny-provider-card__loading,
  .sunny-provider-card__error,
  .sunny-approval-card__label {
    font-size: 14px;
    color: var(--sunny-gray-500);
  }
  .sunny-approval-card__label {
    font-size: 13px;
  }
  .sunny-provider-card__rating {
    margin-left: auto;
    font-size: 13px;
    color: #f59e0b;
    font-weight: 600;
  }
  .sunny-provider-card__meta {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sunny-provider-card__meta-label {
    display: block;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--sunny-gray-500);
    font-weight: 600;
  }
  .sunny-provider-card__meta-value {
    display: block;
    font-size: 14px;
    color: var(--sunny-color-secondary);
    margin-top: 2px;
  }
  .sunny-provider-card--error .sunny-provider-card__loading {
    color: var(--sunny-color-danger);
  }

  /* Approval Cards */
  .sunny-approval-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sunny-approval-card {
    border: 1px solid var(--sunny-gray-200);
    border-radius: 12px;
    padding: 16px;
    background: var(--sunny-gray-50);
  }
  .sunny-approval-card--approved {
    border-color: var(--sunny-color-accent);
    background: var(--sunny-color-accent-bg);
  }
  .sunny-approval-card--rejected {
    border-color: var(--sunny-color-danger);
    background: #fef2f2;
  }
  .sunny-approval-card__header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 12px;
  }
  .sunny-approval-card__title {
    font-weight: 700;
    font-size: 15px;
    color: var(--sunny-color-secondary);
  }
  .sunny-approval-card__status {
    margin-top: 4px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--sunny-color-primary);
    font-weight: 700;
  }
  .sunny-approval-card__arguments {
    background: #fff;
    border: 1px solid var(--sunny-gray-200);
    border-radius: 8px;
    padding: 12px;
    font-size: 12px;
    max-height: 200px;
    overflow: auto;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: var(--sunny-gray-600);
    line-height: 1.5;
  }
  .sunny-approval-card__actions {
    display: flex;
    gap: 10px;
    margin-top: 14px;
  }
  .sunny-approval-card__btn {
    flex: 1;
    border: none;
    border-radius: 8px;
    padding: 12px 18px;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    color: #fff;
    transition: background var(--sunny-transition-fast), transform var(--sunny-transition-fast), box-shadow var(--sunny-transition-fast);
    font-family: inherit;
  }
  .sunny-approval-card__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .sunny-approval-card__btn--approve {
    background: var(--sunny-color-accent);
    box-shadow: 0 2px 8px var(--sunny-color-accent-shadow);
  }
  .sunny-approval-card__btn--approve:hover:not(:disabled) {
    background: var(--sunny-color-accent-hover);
    box-shadow: 0 4px 12px var(--sunny-color-accent-shadow);
  }
  .sunny-approval-card__btn--reject {
    background: var(--sunny-color-danger);
    box-shadow: 0 2px 8px var(--sunny-color-danger-shadow);
  }
  .sunny-approval-card__btn--reject:hover:not(:disabled) {
    background: var(--sunny-color-danger-hover);
    box-shadow: 0 4px 12px var(--sunny-color-danger-shadow);
  }
  .sunny-approval-card__btn--approve:active:not(:disabled),
  .sunny-approval-card__btn--reject:active:not(:disabled) {
    transform: scale(0.98);
  }
  .sunny-approval-card__error {
    margin-top: 10px;
    font-size: 13px;
    color: var(--sunny-color-danger);
    font-weight: 500;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .sunny-chat-modal {
      width: 100%;
      max-width: 100%;
      height: 100%;
      max-height: 100%;
      border-radius: 0;
    }
    .sunny-chat__trigger {
      max-width: 100%;
    }
    .sunny-chat__trigger-input,
    .sunny-chat-modal__input {
      font-size: 16px; /* Prevents zoom on iOS */
    }
    .sunny-chat__trigger-input {
      height: 52px;
    }
    .sunny-chat__messages {
      padding: 16px;
    }
  }
  `;
  document.head.appendChild(style);
}

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const hex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
}

function getOrCreateConversationId(storageKey: string): string {
  try {
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const id = generateUuid();
    window.localStorage.setItem(storageKey, id);
    return id;
  } catch {
    return generateUuid();
  }
}

const USD_FORMATTER =
  typeof Intl !== 'undefined'
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
    : null;

function formatCurrency(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '';
  if (USD_FORMATTER) return USD_FORMATTER.format(value);
  return `$${value.toFixed(0)}`;
}

function formatArguments(value: unknown): string {
  if (value === undefined || value === null) {
    return 'No arguments provided.';
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function splitArtifactSegments(text: string): ArtifactSegment[] {
  if (!text) return [];
  const segments: ArtifactSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(ARTIFACT_TAG_START, cursor);
    if (start === -1) {
      segments.push({ type: 'text', value: text.slice(cursor) });
      break;
    }
    if (start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, start) });
    }
    const idStart = start + ARTIFACT_TAG_START.length;
    const end = text.indexOf(ARTIFACT_TAG_END, idStart);
    if (end === -1) {
      segments.push({ type: 'text', value: text.slice(start) });
      break;
    }
    const id = text.slice(idStart, end).trim().replace(/^["']|["']$/g, '');
    if (id) {
      segments.push({ type: 'artifact', id });
    }
    cursor = end + ARTIFACT_TAG_END.length;
  }
  return segments;
}

function buildApprovalStatuses(messages: SunnyAgentMessage[]): Map<string, ApprovalState> {
  const map = new Map<string, ApprovalState>();
  for (const message of messages) {
    if (message.role !== 'user' || !message.outputItems) continue;
    for (const item of message.outputItems) {
      if (item?.type === 'mcp_approval_response' && item.approval_request_id) {
        map.set(
          String(item.approval_request_id),
          item.approve ? 'approved' : 'rejected',
        );
      }
    }
  }
  return map;
}

function normalizeDoctorProfile(data?: DoctorProfileArtifact | null): ProviderCardViewModel {
  if (!data) {
    return { name: 'Provider' };
  }
  const name = [data.first_name, data.last_name].filter(Boolean).join(' ').trim() || 'Provider';
  const rating = typeof data.rating === 'number' ? data.rating : typeof data.rank_score === 'number' ? data.rank_score : undefined;
  return {
    name,
    specialty: data.specialty ?? undefined,
    rating,
    reviewCount: data.review_count ?? undefined,
    location: extractLocationString(data.locations),
    phone: extractPhoneNumber(data.locations),
    languages: Array.isArray(data.languages_spoken)
      ? data.languages_spoken.map((lang) => lang.charAt(0).toUpperCase() + lang.slice(1))
      : undefined,
    estimatedOop: computeEstimatedCost(data.out_of_pocket_costs),
  };
}

function extractLocationString(locations: unknown): string | undefined {
  if (!locations) return undefined;
  if (typeof locations === 'string') return locations;
  const tryBuild = (value: any) => {
    if (!value) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
      if (typeof value.address === 'string') return value.address;
      const parts = [value.address_line1, value.city, value.state, value.zip_code].filter(Boolean);
      if (parts.length) return parts.join(', ');
    }
    return undefined;
  };
  if (Array.isArray(locations) && locations.length > 0) {
    for (const entry of locations) {
      const result = tryBuild(entry);
      if (result) return result;
    }
  } else if (typeof locations === 'object') {
    const result = tryBuild(locations);
    if (result) return result;
  }
  return undefined;
}

function extractPhoneNumber(locations: unknown): string | undefined {
  const normalize = (phone?: string) => {
    if (!phone) return undefined;
    const digits = phone.replace(/\D+/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone;
  };

  const search = (value: any): string | undefined => {
    if (!value) return undefined;
    if (Array.isArray(value.phone_numbers) && value.phone_numbers.length) {
      const primary = value.phone_numbers.find((entry: any) => entry?.details === 'primary') || value.phone_numbers[0];
      return normalize(primary?.phone || primary?.value);
    }
    if (typeof value.phone === 'string') {
      return normalize(value.phone);
    }
    return undefined;
  };

  if (Array.isArray(locations) && locations.length > 0) {
    for (const entry of locations) {
      const result = search(entry);
      if (result) return result;
    }
  } else if (typeof locations === 'object') {
    const result = search(locations);
    if (result) return result;
  }
  return undefined;
}

function computeEstimatedCost(costs?: DoctorProfileArtifact['out_of_pocket_costs']): number | undefined {
  if (!costs || !costs.length) return undefined;
  let total = 0;
  let count = 0;
  for (const cost of costs) {
    const value = typeof cost?.out_of_pocket === 'number' ? cost.out_of_pocket : typeof cost?.rate === 'number' ? cost.rate : undefined;
    if (typeof value === 'number' && !Number.isNaN(value)) {
      total += value;
      count += 1;
    }
  }
  if (!count) return undefined;
  return total / count;
}