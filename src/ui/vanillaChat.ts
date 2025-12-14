import { SunnyAgentsClient } from '../client/SunnyAgentsClient';
import type {
  DoctorProfileArtifact,
  SunnyAgentMessage,
  SunnyAgentMessageItem,
  SunnyAgentsClientSnapshot,
  SunnyAgentsConfig,
} from '../types';

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
  root.innerHTML = `
    <div class="sunny-chat-modal-backdrop" aria-hidden="true">
      <div class="sunny-chat-modal" role="dialog" aria-modal="true" aria-labelledby="sunny-chat-title">
        <button type="button" class="sunny-chat-modal__close" aria-label="Close chat">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
          </svg>
        </button>
        <div class="sunny-chat__header">
          <div class="sunny-chat__header-avatar">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <div class="sunny-chat__header-info">
            <h3 class="sunny-chat__title" id="sunny-chat-title">${headerTitle}</h3>
            <p class="sunny-chat__subtitle">Healthcare Concierge</p>
          </div>
        </div>
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
  .sunny-chat {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    color: #212124;
  }

  /* Modal Backdrop */
  .sunny-chat-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    opacity: 0;
    visibility: hidden;
    transition: opacity 150ms ease, visibility 150ms ease;
  }
  .sunny-chat-modal-backdrop--open {
    opacity: 1;
    visibility: visible;
  }

  /* Modal Container */
  .sunny-chat-modal {
    position: relative;
    width: 794px;
    max-width: 95vw;
    height: 560px;
    max-height: 85vh;
    background: #ffffff;
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: translateY(10px);
    transition: transform 150ms ease;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }
  .sunny-chat-modal-backdrop--open .sunny-chat-modal {
    transform: translateY(0);
  }

  /* Close Button */
  .sunny-chat-modal__close {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: rgba(0, 0, 0, 0.05);
    color: #52535a;
    cursor: pointer;
    display: grid;
    place-items: center;
    z-index: 10;
    transition: background 100ms ease;
  }
  .sunny-chat-modal__close:hover {
    background: rgba(0, 0, 0, 0.1);
  }
  .sunny-chat-modal__close svg {
    width: 16px;
    height: 16px;
  }

  /* Header */
  .sunny-chat__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 24px;
    background: #ffffff;
    border-bottom: 1px solid #f0f0f2;
  }
  .sunny-chat__header-avatar {
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #006fff 0%, #0057cc 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    flex-shrink: 0;
  }
  .sunny-chat__header-avatar svg {
    width: 20px;
    height: 20px;
  }
  .sunny-chat__header-info {
    flex: 1;
    min-width: 0;
  }
  .sunny-chat__title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #212124;
  }
  .sunny-chat__subtitle {
    margin: 2px 0 0;
    font-size: 13px;
    color: #838691;
  }

  /* Messages Area */
  .sunny-chat__messages {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: #fafafa;
  }

  /* Message Bubbles */
  .sunny-chat__message {
    max-width: 85%;
    padding: 12px 16px;
    border-radius: 12px;
    line-height: 1.5;
    font-size: 14px;
  }
  .sunny-chat__message--user {
    align-self: flex-end;
    background: #006fff;
    color: #ffffff;
  }
  .sunny-chat__message--assistant {
    align-self: flex-start;
    background: #ffffff;
    color: #212124;
    border: 1px solid #e8e8ea;
  }
  .sunny-chat__bubble {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sunny-chat__bubble p {
    margin: 0;
    line-height: 1.6;
    color: inherit;
  }

  /* Modal Composer */
  .sunny-chat-modal__composer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 24px 20px;
    background: #ffffff;
    border-top: 1px solid #f0f0f2;
  }
  .sunny-chat-modal__input {
    flex: 1;
    height: 44px;
    padding: 0 16px;
    border: 1px solid #dbdce1;
    border-radius: 22px;
    background: #ffffff;
    color: #212124;
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: border-color 100ms ease, box-shadow 100ms ease;
  }
  .sunny-chat-modal__input:focus {
    border-color: #006fff;
    box-shadow: 0 0 0 3px rgba(0, 111, 255, 0.1);
  }
  .sunny-chat-modal__input::placeholder {
    color: #838691;
  }

  /* Trigger Input - Ubiquiti Style */
  .sunny-chat__trigger {
    display: flex;
    align-items: center;
    position: relative;
  }
  .sunny-chat__trigger-input {
    width: 100%;
    height: 52px;
    padding: 0 56px 0 20px;
    border: 1px solid #dbdce1;
    border-radius: 26px;
    background: #ffffff;
    color: #212124;
    font-size: 15px;
    font-family: inherit;
    outline: none;
    transition: border-color 100ms ease, box-shadow 100ms ease;
  }
  .sunny-chat__trigger-input:focus {
    border-color: #006fff;
    box-shadow: 0 0 0 3px rgba(0, 111, 255, 0.1);
  }
  .sunny-chat__trigger-input::placeholder {
    color: #838691;
  }

  /* Send Button */
  .sunny-chat__send-btn {
    position: absolute;
    right: 6px;
    width: 40px;
    height: 40px;
    padding: 0;
    background: #006fff;
    color: #ffffff;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 100ms ease, transform 100ms ease;
    flex-shrink: 0;
  }
  .sunny-chat__send-btn:hover {
    background: #0057cc;
  }
  .sunny-chat__send-btn:active {
    transform: scale(0.95);
  }
  .sunny-chat__send-btn svg {
    width: 18px;
    height: 18px;
  }

  /* Modal Send Button */
  .sunny-chat-modal__composer .sunny-chat__send-btn {
    position: relative;
    right: auto;
  }

  /* Provider Card */
  .sunny-provider-card {
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 16px;
    background: #ffffff;
  }
  .sunny-provider-card--loading {
    opacity: 0.7;
  }
  .sunny-provider-card__header {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
    margin-bottom: 12px;
  }
  .sunny-provider-card__name {
    font-weight: 600;
    font-size: 16px;
    color: #111827;
  }
  .sunny-provider-card__specialty {
    font-size: 14px;
    color: #6b7280;
  }
  .sunny-provider-card__rating {
    margin-left: auto;
    font-size: 13px;
    color: #f59e0b;
  }
  .sunny-provider-card__meta {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sunny-provider-card__meta-label {
    display: block;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #9ca3af;
  }
  .sunny-provider-card__meta-value {
    display: block;
    font-size: 14px;
    color: #111827;
  }
  .sunny-provider-card__loading,
  .sunny-provider-card__error {
    font-size: 14px;
    color: #6b7280;
  }
  .sunny-provider-card--error .sunny-provider-card__loading {
    color: #dc2626;
  }

  /* Approval Cards */
  .sunny-approval-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sunny-approval-card {
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 14px;
    background: #f9fafb;
  }
  .sunny-approval-card--approved {
    border-color: #22c55e;
    background: #f0fdf4;
  }
  .sunny-approval-card--rejected {
    border-color: #ef4444;
    background: #fef2f2;
  }
  .sunny-approval-card--busy {
    opacity: 0.7;
  }
  .sunny-approval-card__header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 10px;
  }
  .sunny-approval-card__title {
    font-weight: 600;
    color: #111827;
  }
  .sunny-approval-card__label {
    font-size: 13px;
    color: #6b7280;
  }
  .sunny-approval-card__status {
    margin-top: 4px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #1E3765;
  }
  .sunny-approval-card__arguments {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 10px;
    font-size: 12px;
    max-height: 200px;
    overflow: auto;
    font-family: monospace;
  }
  .sunny-approval-card__actions {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }
  .sunny-approval-card__btn {
    flex: 1;
    border: none;
    border-radius: 8px;
    padding: 10px 16px;
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
    color: #ffffff;
    transition: background 150ms ease, transform 150ms ease;
  }
  .sunny-approval-card__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .sunny-approval-card__btn--approve {
    background: #22c55e;
  }
  .sunny-approval-card__btn--approve:hover:not(:disabled) {
    background: #16a34a;
  }
  .sunny-approval-card__btn--reject {
    background: #ef4444;
  }
  .sunny-approval-card__btn--reject:hover:not(:disabled) {
    background: #dc2626;
  }
  .sunny-approval-card__error {
    margin-top: 8px;
    font-size: 12px;
    color: #dc2626;
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