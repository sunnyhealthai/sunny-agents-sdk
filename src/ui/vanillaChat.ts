import { AsYouType, getCountries, getCountryCallingCode, getExampleNumber, parsePhoneNumberFromString } from 'libphonenumber-js/min';
import examples from 'libphonenumber-js/examples.mobile.json';
import type { CountryCode } from 'libphonenumber-js/min';
import { SunnyAgentsClient } from '../client/SunnyAgentsClient';
import type { LLMWebSocketManager } from '../client/llmWebSocket';
import type { PasswordlessAuthManager } from '../client/passwordlessAuth';
import type {
  AuthUpgradeProfileSyncData,
  DoctorProfileArtifact,
  LocationDetailArtifact,
  LocationGroup,
  LocationSearchResultsArtifact,
  NestedProvider,
  ProviderNameSearchResultsArtifact,
  ProviderResult,
  ProviderSearchResultsArtifact,
  SchedulingProgressArtifact,
  SdkAuthType,
  SunnyAgentMessage,
  SunnyAgentMessageItem,
  SunnyAgentsClientSnapshot,
  SunnyAgentsConfig,
  VanillaChatColors,
  VanillaChatConciergePanel,
  VanillaChatDimensions,
  VanillaChatDisplayMode,
  VanillaChatPromptSuggestion,
} from '../types';
export type {
  VanillaChatColors,
  VanillaChatConciergePanel,
  VanillaChatDimensions,
  VanillaChatDisplayMode,
  VanillaChatPromptSuggestion,
};

export interface VanillaChatOptions {
  container: HTMLElement;
  client?: SunnyAgentsClient;
  config?: SunnyAgentsConfig;
  headerTitle?: string;
  /**
   * Placeholder text displayed in the input fields. Defaults to "Ask anything…".
   */
  placeholder?: string;
  /**
   * If true, will skip server conversation creation (useful for anonymous flows).
   */
  anonymous?: boolean;
  /**
    * Optional conversation ID to use for anonymous sessions.
    * If not provided, a new UUID will be generated (in-memory only, no persistence).
    */
  conversationId?: string;
  /**
   * Custom theme colors for the chat UI.
   * Uses CSS custom properties for easy styling.
   */
  colors?: VanillaChatColors;
  /**
   * Display mode for the collapsed widget.
   * - trigger: input bar only
   * - concierge: intro copy, suggestions, branding, and the trigger
   */
  displayMode?: VanillaChatDisplayMode;
  /**
   * Additional content for the concierge panel mode.
   */
  concierge?: VanillaChatConciergePanel;
  /**
   * Base font size for chat content (e.g. "14px", "1rem"). Default: 14px
   */
  fontSize?: string;
  /**
   * Font family for the chat UI (e.g. "'Inter', sans-serif"). Default: Lato
   */
  fontFamily?: string;
  /**
   * Widget dimensions (modal width/height, trigger max-width).
   */
  dimensions?: VanillaChatDimensions;
  /**
   * Optional PasswordlessAuthManager instance for handling verification flow in chat messages.
   * When provided, verification flow tags in messages will render a passwordless login form.
   */
  passwordlessAuth?: PasswordlessAuthManager;
  /**
   * Optional values used to pre-fill the verification flow inputs. Useful when the host
   * has already collected an email or phone earlier in the flow and wants to save the user
   * from re-typing. The phone value should be digits only (region code is selected via the
   * country dropdown).
   */
  verificationPrefill?: {
    email?: string;
    phone?: string;
  };
}

export interface VanillaChatInstance {
  client: SunnyAgentsClient;
  destroy: () => void;
  /**
   * Switch auth type at runtime. Uses cached server config from sdk.session.created.
   * Only available when the instance was created via createSunnyChat().
   */
  setAuthType?: (
    authType: SdkAuthType,
    options?: {
      idTokenProvider?: () => Promise<string | null>;
      authUpgradeProfileSync?: AuthUpgradeProfileSyncData | (() => Promise<AuthUpgradeProfileSyncData | null>);
    },
  ) => Promise<void>;
  /**
   * Set the passwordless auth manager after async initialization.
   * Called by createSunnyChat once SDK config is fetched.
   */
  setPasswordlessAuth: (auth: PasswordlessAuthManager) => void;
}

const STYLE_ID = 'sunny-agents-vanilla-style';
const EXPANDED_DOCTOR_PROFILE_START = '{expanded_doctor_profile}';
const EXPANDED_DOCTOR_PROFILE_END = '{/expanded_doctor_profile}';
const MINIMAL_DOCTOR_PROFILE_START = '{minimal_doctor_profile}';
const MINIMAL_DOCTOR_PROFILE_END = '{/minimal_doctor_profile}';
const DOCTOR_PROFILE_START = '{doctor_profile}';
const DOCTOR_PROFILE_END = '{/doctor_profile}';
const VERIFICATION_FLOW_START = '{verification_flow}';
const VERIFICATION_FLOW_END = '{/verification_flow}';
const SCHEDULING_PROGRESS_START = '{scheduling_progress}';
const SCHEDULING_PROGRESS_END = '{/scheduling_progress}';
const EMAIL_CONFIRM_START = '{email_confirm}';
const EMAIL_CONFIRM_END = '{/email_confirm}';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizePromptSuggestions(
  suggestions?: Array<string | VanillaChatPromptSuggestion>,
): VanillaChatPromptSuggestion[] {
  return (suggestions ?? []).map((suggestion) =>
    typeof suggestion === 'string'
      ? { label: suggestion, prompt: suggestion }
      : {
          label: suggestion.label,
          prompt: suggestion.prompt ?? suggestion.label,
          emphasis: suggestion.emphasis,
          requiresAuth: suggestion.requiresAuth,
        },
  );
}

/**
 * Country list built from libphonenumber-js. Each entry has the ISO-2 code,
 * the flag emoji (computed from the ISO-2 regional-indicator codepoints), a
 * localized display name (via Intl.DisplayNames with an "en" fallback for
 * older browsers), and the E.164 calling code. Sorted alphabetically by name
 * with United States pinned to the top.
 */
export interface CountryEntry {
  iso: CountryCode;
  flag: string;
  name: string;
  code: string;
}

function isoToFlag(iso: string): string {
  return [...iso.toUpperCase()]
    .map((ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65))
    .join('');
}

const COUNTRY_LIST: CountryEntry[] = (() => {
  let displayNames: { of: (iso: string) => string | undefined } | null = null;
  try {
    displayNames = new (Intl as any).DisplayNames(['en'], { type: 'region' });
  } catch {
    displayNames = null;
  }
  const entries: CountryEntry[] = getCountries().map((iso) => ({
    iso,
    flag: isoToFlag(iso),
    name: displayNames?.of(iso) ?? iso,
    code: getCountryCallingCode(iso),
  }));
  entries.sort((a, b) => {
    if (a.iso === 'US') return -1;
    if (b.iso === 'US') return 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
})();

const COUNTRY_BY_ISO: Map<CountryCode, CountryEntry> = new Map(
  COUNTRY_LIST.map((entry) => [entry.iso, entry]),
);

interface CountryPicker {
  el: HTMLElement;
  getIso(): CountryCode;
  getCode(): string;
  setIso(iso: CountryCode): void;
  setDisabled(disabled: boolean): void;
  onChange(handler: (iso: CountryCode) => void): void;
}

/**
 * Custom country dropdown. Closed state shows only the flag emoji + chevron.
 * Open popover shows "🇺🇸 United States (+1)" rows with a search filter.
 * Keyboard: ArrowUp/Down navigate, Enter selects, Escape closes.
 */
function createCountryPicker(initialIso: CountryCode = 'US'): CountryPicker {
  let currentIso: CountryCode = COUNTRY_BY_ISO.has(initialIso) ? initialIso : 'US';
  let isOpen = false;
  let disabled = false;
  let changeHandler: ((iso: CountryCode) => void) | null = null;
  let focusedIndex = -1;
  let filtered: CountryEntry[] = COUNTRY_LIST.slice();

  const wrapper = document.createElement('div');
  wrapper.className = 'sunny-country-picker';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sunny-country-picker__button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', 'Country or region');

  const flagEl = document.createElement('span');
  flagEl.className = 'sunny-country-picker__flag';
  flagEl.setAttribute('aria-hidden', 'true');
  const chevronEl = document.createElement('span');
  chevronEl.className = 'sunny-country-picker__chevron';
  chevronEl.setAttribute('aria-hidden', 'true');
  chevronEl.textContent = '▾';
  button.appendChild(flagEl);
  button.appendChild(chevronEl);

  const popover = document.createElement('div');
  popover.className = 'sunny-country-picker__popover';
  popover.setAttribute('role', 'listbox');
  popover.hidden = true;

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'sunny-country-picker__search';
  searchInput.placeholder = 'Search country';
  searchInput.setAttribute('aria-label', 'Search country');
  searchInput.autocomplete = 'off';

  const listEl = document.createElement('div');
  listEl.className = 'sunny-country-picker__list';

  popover.appendChild(searchInput);
  popover.appendChild(listEl);
  wrapper.appendChild(button);
  wrapper.appendChild(popover);

  const renderButton = () => {
    const entry = COUNTRY_BY_ISO.get(currentIso);
    flagEl.textContent = entry?.flag ?? '🌐';
    button.setAttribute('aria-label', entry ? `Country or region: ${entry.name}` : 'Country or region');
  };

  const renderList = () => {
    listEl.innerHTML = '';
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sunny-country-picker__empty';
      empty.textContent = 'No matches';
      listEl.appendChild(empty);
      return;
    }
    filtered.forEach((entry, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'sunny-country-picker__row';
      row.dataset.iso = entry.iso;
      row.setAttribute('role', 'option');
      if (entry.iso === currentIso) {
        row.classList.add('sunny-country-picker__row--selected');
        row.setAttribute('aria-selected', 'true');
      }
      if (i === focusedIndex) {
        row.classList.add('sunny-country-picker__row--focused');
      }
      const flag = document.createElement('span');
      flag.className = 'sunny-country-picker__row-flag';
      flag.textContent = entry.flag;
      flag.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'sunny-country-picker__row-name';
      name.textContent = entry.name;
      const code = document.createElement('span');
      code.className = 'sunny-country-picker__row-code';
      code.textContent = `(+${entry.code})`;
      row.appendChild(flag);
      row.appendChild(name);
      row.appendChild(code);
      row.addEventListener('click', (e) => {
        e.preventDefault();
        select(entry.iso);
      });
      listEl.appendChild(row);
    });
    // Scroll focused row into view
    if (focusedIndex >= 0) {
      const focusedEl = listEl.children[focusedIndex] as HTMLElement | undefined;
      focusedEl?.scrollIntoView({ block: 'nearest' });
    }
  };

  const applyFilter = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) {
      filtered = COUNTRY_LIST.slice();
    } else {
      filtered = COUNTRY_LIST.filter(
        (entry) =>
          entry.name.toLowerCase().includes(q) ||
          entry.iso.toLowerCase().includes(q) ||
          entry.code.includes(q.replace(/^\+/, '')),
      );
    }
    focusedIndex = filtered.findIndex((e) => e.iso === currentIso);
    if (focusedIndex === -1 && filtered.length > 0) focusedIndex = 0;
    renderList();
  };

  const onDocumentMouseDown = (e: MouseEvent) => {
    if (!isOpen) return;
    if (!wrapper.contains(e.target as Node)) close();
  };

  const open = () => {
    if (disabled || isOpen) return;
    isOpen = true;
    popover.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    searchInput.value = '';
    applyFilter('');
    searchInput.focus();
    // Only register the outside-click handler while the popover is open. The
    // previous version registered one document listener per picker at
    // construction time and never removed it, which leaked global handlers
    // every time the verification card re-rendered.
    document.addEventListener('mousedown', onDocumentMouseDown);
  };

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    popover.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDocumentMouseDown);
  };

  const select = (iso: CountryCode) => {
    const changed = iso !== currentIso;
    currentIso = iso;
    renderButton();
    close();
    if (changed && changeHandler) changeHandler(iso);
  };

  button.addEventListener('click', (e) => {
    e.preventDefault();
    if (isOpen) close();
    else open();
  });

  searchInput.addEventListener('input', () => {
    applyFilter(searchInput.value);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      button.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filtered.length === 0) return;
      focusedIndex = (focusedIndex + 1) % filtered.length;
      renderList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filtered.length === 0) return;
      focusedIndex = (focusedIndex - 1 + filtered.length) % filtered.length;
      renderList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[focusedIndex];
      if (target) select(target.iso);
    }
  });

  renderButton();

  return {
    el: wrapper,
    getIso: () => currentIso,
    getCode: () => COUNTRY_BY_ISO.get(currentIso)?.code ?? '1',
    setIso: (iso) => {
      if (COUNTRY_BY_ISO.has(iso)) {
        currentIso = iso;
        renderButton();
      }
    },
    setDisabled: (d) => {
      disabled = d;
      button.disabled = d;
      if (d) close();
    },
    onChange: (handler) => {
      changeHandler = handler;
    },
  };
}

interface DigitBubblePhoneInput {
  el: HTMLElement;
  getDigits(): string;
  setDigits(digits: string): void;
  setIso(iso: CountryCode): void;
  setDisabled(disabled: boolean): void;
  focus(): void;
  clear(): void;
}

/**
 * Renders a phone number as a sequence of digit cells with country-specific
 * separator glyphs (e.g. `(___) ___-____` for US). Uses libphonenumber-js
 * AsYouType + example numbers to derive the mask. A hidden <input type="tel">
 * is the source of truth for the value; cells re-render on input/blur and
 * relay keystrokes back to the hidden input. Maintains accessibility via the
 * hidden input's label.
 */
function createDigitBubblePhoneInput(initialIso: CountryCode = 'US'): DigitBubblePhoneInput {
  let currentIso: CountryCode = COUNTRY_BY_ISO.has(initialIso) ? initialIso : 'US';
  let digits = '';
  let disabled = false;

  const getExpectedDigitCount = (iso: CountryCode): number => {
    try {
      const example = getExampleNumber(iso, examples as any);
      if (example) return example.nationalNumber.length;
    } catch {
      // fall through
    }
    return 10;
  };

  const getFormatted = (iso: CountryCode, raw: string): string => {
    if (!raw) return '';
    try {
      const formatter = new AsYouType(iso);
      return formatter.input(raw);
    } catch {
      return raw;
    }
  };

  const getMask = (iso: CountryCode): string => {
    const example = (() => {
      try {
        return getExampleNumber(iso, examples as any);
      } catch {
        return null;
      }
    })();
    if (!example) {
      return '__________';
    }
    const formatted = example.formatNational();
    // Strip the leading country code-like prefix if present (some locales include it).
    return formatted.replace(/\d/g, '_');
  };

  const wrapper = document.createElement('div');
  wrapper.className = 'sunny-digit-phone';

  const cellsEl = document.createElement('div');
  cellsEl.className = 'sunny-digit-phone__cells';
  cellsEl.setAttribute('aria-hidden', 'true');

  // Hidden text input — the real keyboard target. Holds digits only.
  const hidden = document.createElement('input');
  hidden.type = 'tel';
  hidden.className = 'sunny-digit-phone__input';
  hidden.inputMode = 'numeric';
  hidden.autocomplete = 'tel-national';
  hidden.setAttribute('aria-label', 'Phone number');

  wrapper.appendChild(cellsEl);
  wrapper.appendChild(hidden);

  const render = () => {
    cellsEl.innerHTML = '';
    const mask = getMask(currentIso);
    const expected = getExpectedDigitCount(currentIso);
    let digitCursor = 0;
    const overflow = digits.length > expected;
    for (const ch of mask) {
      if (ch === '_') {
        const cell = document.createElement('span');
        cell.className = 'sunny-digit-phone__cell';
        const d = digits[digitCursor++];
        if (d !== undefined) {
          cell.textContent = d;
          cell.classList.add('sunny-digit-phone__cell--filled');
        } else {
          cell.textContent = '';
        }
        // Mark the next-empty cell as the "active" one for caret styling.
        if (d === undefined && digitCursor - 1 === digits.length && !disabled) {
          cell.classList.add('sunny-digit-phone__cell--active');
        }
        cellsEl.appendChild(cell);
      } else {
        const sep = document.createElement('span');
        sep.className = 'sunny-digit-phone__sep';
        sep.textContent = ch;
        cellsEl.appendChild(sep);
      }
    }
    // Render any overflow digits in a trailing run so users see what they typed
    // even when they exceed the expected length (some carriers tolerate trailing
    // digits; we'd rather show than silently swallow).
    if (overflow) {
      for (let i = expected; i < digits.length; i++) {
        const cell = document.createElement('span');
        cell.className = 'sunny-digit-phone__cell sunny-digit-phone__cell--filled sunny-digit-phone__cell--overflow';
        cell.textContent = digits[i] ?? '';
        cellsEl.appendChild(cell);
      }
    }
  };

  // Focus the hidden input when the user clicks the cells row.
  wrapper.addEventListener('click', (e) => {
    if (disabled) return;
    if (e.target === hidden) return;
    e.preventDefault();
    hidden.focus();
  });

  hidden.addEventListener('input', () => {
    const newDigits = hidden.value.replace(/\D/g, '');
    digits = newDigits;
    // Surface the formatted value in the hidden input's accessible name via aria.
    const formatted = getFormatted(currentIso, digits);
    hidden.setAttribute('data-formatted', formatted);
    render();
  });

  hidden.addEventListener('focus', () => {
    wrapper.classList.add('sunny-digit-phone--focused');
    render();
  });
  hidden.addEventListener('blur', () => {
    wrapper.classList.remove('sunny-digit-phone--focused');
    render();
  });

  render();

  return {
    el: wrapper,
    getDigits: () => digits,
    setDigits: (d) => {
      digits = (d || '').replace(/\D/g, '');
      hidden.value = digits;
      render();
    },
    setIso: (iso) => {
      if (!COUNTRY_BY_ISO.has(iso)) return;
      currentIso = iso;
      render();
    },
    setDisabled: (d) => {
      disabled = d;
      hidden.disabled = d;
      render();
    },
    focus: () => hidden.focus(),
    clear: () => {
      digits = '';
      hidden.value = '';
      render();
    },
  };
}


type ArtifactSegment =
  | { type: 'text'; value: string }
  | { type: 'expanded_profile'; data: any }
  | { type: 'minimal_profile'; data: any }
  | { type: 'legacy_profile'; data: any }
  | { type: 'provider_search_results'; data: ProviderSearchResultsArtifact }
  // Location-grouped variants emitted by the four mcp-external search tools
  // introduced in monorepo PR #469. The flat `provider_search_results`
  // variant above is retained for asksunny / consumer chat and the legacy
  // mcp-external `search_providers` tool (now removed).
  | { type: 'location_search_results'; data: LocationSearchResultsArtifact }
  | { type: 'provider_name_search_results'; data: ProviderNameSearchResultsArtifact }
  | { type: 'location_detail'; data: LocationDetailArtifact }
  | { type: 'verification_flow'; action: string; phone?: string; email?: string }
  | { type: 'scheduling_progress'; data: SchedulingProgressArtifact | null }
  | { type: 'email_confirm'; email: string };
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
    placeholder = 'Ask anything…',
    anonymous = false,
    conversationId: providedConversationId,
    colors = {},
    displayMode = 'trigger',
    concierge,
    fontSize,
    fontFamily,
    dimensions,
    passwordlessAuth: initialPasswordlessAuth,
    verificationPrefill,
  } = options;

  let passwordlessAuth = initialPasswordlessAuth;

  // In-memory conversation id for this tab: reused across WebSocket reconnects / new server sessions
  let persistedConversationId = providedConversationId || generateUuid();

  const client = providedClient ?? new SunnyAgentsClient({
    ...config,
    initialConversationId: config?.initialConversationId ?? persistedConversationId,
    createServerConversations:
      typeof config?.createServerConversations === 'boolean'
        ? config.createServerConversations
        : !anonymous && !!(config?.idTokenProvider && config?.tokenExchange),
  });
  ensureStyles();

  // DOM structure
  const root = document.createElement('div');
  root.className = `sunny-chat sunny-chat--collapsed ${displayMode === 'concierge' ? 'sunny-chat--concierge' : ''}`.trim();

  // Apply custom theme properties
  if (colors.primary) root.style.setProperty('--sunny-color-primary', colors.primary);
  if (colors.secondary) root.style.setProperty('--sunny-color-secondary', colors.secondary);
  if (colors.accent) root.style.setProperty('--sunny-color-accent', colors.accent);
  if (colors.background) root.style.setProperty('--sunny-color-background', colors.background);
  if (colors.text) root.style.setProperty('--sunny-color-text', colors.text);
  if (colors.panelBackground) root.style.setProperty('--sunny-panel-background', colors.panelBackground);
  if (colors.mutedText) root.style.setProperty('--sunny-color-muted-text', colors.mutedText);
  if (colors.chipBackground) root.style.setProperty('--sunny-chip-background', colors.chipBackground);
  if (colors.chipBorder) root.style.setProperty('--sunny-chip-border', colors.chipBorder);
  if (colors.chipText) root.style.setProperty('--sunny-chip-text', colors.chipText);
  if (fontSize) root.style.setProperty('--sunny-font-size-base', fontSize);
  if (fontFamily) root.style.setProperty('--sunny-font-family', fontFamily);
  if (dimensions?.width) root.style.setProperty('--sunny-modal-width', dimensions.width);
  if (dimensions?.height) root.style.setProperty('--sunny-modal-height', dimensions.height);
  if (dimensions?.triggerMaxWidth) root.style.setProperty('--sunny-trigger-max-width', dimensions.triggerMaxWidth);
  if (dimensions?.panelMaxWidth) root.style.setProperty('--sunny-panel-max-width', dimensions.panelMaxWidth);
  const normalizedSuggestions = normalizePromptSuggestions(concierge?.suggestions);
  const conciergeAlign = concierge?.align === 'center' ? 'center' : 'left';
  const introMarkup = concierge?.introText
    ? `
        <p class="sunny-chat__concierge-intro">
          ${escapeHtml(concierge.introText)}
          ${concierge?.introStrongText ? ` <strong>${escapeHtml(concierge.introStrongText)}</strong>` : ''}
        </p>
      `
    : '';
  const suggestionsMarkup = normalizedSuggestions.length
    ? `
        <div class="sunny-chat__suggestions" aria-label="Example prompts">
          ${normalizedSuggestions
            .map((suggestion) => {
              const classes = ['sunny-chat__suggestion-btn'];
              if (suggestion.emphasis === 'primary') {
                classes.push('sunny-chat__suggestion-btn--primary');
              }
              return `
                <button
                  type="button"
                  class="${classes.join(' ')}"
                  data-suggestion-prompt="${escapeHtml(suggestion.prompt ?? suggestion.label)}"
                  ${suggestion.requiresAuth ? 'data-suggestion-requires-auth="true"' : ''}
                >
                  ${escapeHtml(suggestion.label)}
                </button>
              `;
            })
            .join('')}
        </div>
      `
    : '';
  const triggerMarkup = `
    <div class="sunny-chat__trigger">
      <input type="text" class="sunny-chat__trigger-input" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}" />
      <button type="button" class="sunny-chat__send-btn" aria-label="Send message">
        <svg class="sunny-chat__send-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m22 2-7 20-4-9-9-4 20-7z" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
        <span class="sunny-chat__send-spinner"></span>
      </button>
    </div>
  `;
  root.innerHTML = `
    <div class="sunny-chat-modal-backdrop" aria-hidden="true">
      <div class="sunny-chat-modal" role="dialog" aria-modal="true">
        <button type="button" class="sunny-chat-modal__close" aria-label="Close chat">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
          </svg>
        </button>
        <div class="sunny-chat__status" role="status" aria-live="polite" hidden>
          <div class="sunny-chat__status-line">
            <span class="sunny-chat__status-label"></span>
          </div>
          <div class="sunny-chat__status-bubbles"></div>
        </div>
        <div class="sunny-chat__messages" aria-live="polite"></div>
        <div class="sunny-chat-modal__composer">
          <input type="text" class="sunny-chat-modal__input" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(placeholder)}" />
          <button type="button" class="sunny-chat__send-btn" aria-label="Send message">
            <svg class="sunny-chat__send-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m22 2-7 20-4-9-9-4 20-7z" stroke-linejoin="round" stroke-linecap="round"/>
            </svg>
            <span class="sunny-chat__send-spinner"></span>
          </button>
        </div>
      </div>
    </div>
    ${
      displayMode === 'concierge'
        ? `
          <div class="sunny-chat__concierge-shell sunny-chat__concierge-shell--${conciergeAlign}">
            <div class="sunny-chat__concierge-main">
              ${introMarkup}
              ${triggerMarkup}
              <div class="sunny-chat__concierge-footer">
                ${suggestionsMarkup}
                <div class="sunny-chat__branding" aria-label="Powered by Sunny Health AI">
                  <span class="sunny-chat__branding-mark" aria-hidden="true"></span>
                  <span class="sunny-chat__branding-copy">
                    Powered by
                    <a href="https://sunnyhealthai.com" target="_blank" rel="noopener noreferrer" class="sunny-chat__branding-link">Sunny Health AI</a>
                  </span>
                </div>
              </div>
            </div>
          </div>
        `
        : triggerMarkup
    }
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
  const suggestionButtons = Array.from(root.querySelectorAll('.sunny-chat__suggestion-btn')) as HTMLButtonElement[];
  const statusEl = root.querySelector('.sunny-chat__status') as HTMLElement;
  const statusLabelEl = statusEl.querySelector('.sunny-chat__status-label') as HTMLElement;
  const statusBubblesEl = statusEl.querySelector('.sunny-chat__status-bubbles') as HTMLElement;

  let unsubscribes: Array<() => void> = [];
  let latestSnapshot: SunnyAgentsClientSnapshot | null = null;
  let isExpanded = false;
  let isClosing = false; // Flag to prevent immediate reopen on focus
  let latestProgress: SchedulingProgressArtifact | null = null;
  let progressConversationId: string | null = null;

  // Map the agent's flow id to a short, calm status label.
  const statusLabelForFlow = (flow?: string): string => {
    switch (flow) {
      case 'reschedule':
        return 'Rescheduling your appointment…';
      case 'cancel':
        return 'Cancelling your appointment…';
      case 'schedule':
      default:
        return 'Booking your appointment…';
    }
  };

  // Canonical bubble layout per flow. Bubbles render in this exact order;
  // the agent reports which ids have been satisfied via `completed_steps`
  // and the SDK checks them off — completion lands in any order (e.g. user
  // volunteers their group ID first → `insurance` lights up immediately even
  // though it's near the end of the row).
  const CANONICAL_STEPS: Record<string, Array<{ id: string; label: string }>> = {
    schedule: [
      { id: 'reason', label: 'Visit reason' },
      { id: 'plan', label: 'Insurance plan' },
      { id: 'provider', label: 'Provider preference' },
      { id: 'location', label: 'Location' },
      { id: 'time', label: 'Appointment time' },
      { id: 'patient', label: 'Patient details' },
      { id: 'insurance', label: 'Insurance details' },
      { id: 'verify', label: 'Verification' },
    ],
    reschedule: [
      { id: 'appointment', label: 'Appointment' },
      { id: 'time', label: 'New time' },
      { id: 'provider', label: 'Provider preference' },
      { id: 'verify', label: 'Verification' },
    ],
    cancel: [
      { id: 'appointment', label: 'Appointment' },
      { id: 'confirm', label: 'Confirm cancel' },
      { id: 'verify', label: 'Verification' },
    ],
  };

  const completedSetForData = (data: SchedulingProgressArtifact): Set<string> => {
    if (Array.isArray(data.completed_steps)) {
      return new Set(data.completed_steps);
    }
    // Backward-compat for the legacy current_step/total_steps payload:
    // treat steps 1..current_step-1 as completed against the canonical list.
    const flow = data.flow ?? 'schedule';
    const steps = CANONICAL_STEPS[flow] ?? CANONICAL_STEPS.schedule;
    const cs = typeof data.current_step === 'number' ? data.current_step : 0;
    const inferred = new Set<string>();
    for (let i = 0; i < Math.min(cs - 1, steps.length); i++) {
      inferred.add(steps[i].id);
    }
    return inferred;
  };

  // Tracks the bubble row's current visible state so we can apply
  // incremental updates instead of nuking and recreating every bubble on
  // each render. The message list is rebuilt from scratch on every
  // streamed token batch — without this cache, every batch would
  // re-create the bubble DOM, re-add the `--done` class, and re-fire
  // the pop animation on bubbles that had finished animating already
  // (the "spaz / bouncing" the user reported).
  let renderedFlow: string | null = null;
  let renderedDone: Set<string> = new Set();

  const buildBubbleElement = (step: { id: string; label: string }, isDone: boolean): HTMLSpanElement => {
    const bubble = document.createElement('span');
    bubble.className = 'sunny-chat__status-bubble';
    bubble.title = step.label;
    bubble.setAttribute('role', 'img');
    bubble.dataset.stepId = step.id;
    bubble.setAttribute(
      'aria-label',
      `${step.label}: ${isDone ? 'done' : 'pending'}`,
    );
    if (isDone) {
      bubble.classList.add('sunny-chat__status-bubble--done');
      bubble.innerHTML =
        '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
        '<path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>';
    }
    return bubble;
  };

  const flipBubbleDone = (bubble: HTMLElement, step: { id: string; label: string }) => {
    bubble.classList.add('sunny-chat__status-bubble--done');
    bubble.setAttribute('aria-label', `${step.label}: done`);
    bubble.innerHTML =
      '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
      '<path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  };

  const unflipBubble = (bubble: HTMLElement, step: { id: string; label: string }) => {
    bubble.classList.remove('sunny-chat__status-bubble--done');
    bubble.setAttribute('aria-label', `${step.label}: pending`);
    bubble.innerHTML = '';
  };

  const setsEqual = (a: Set<string>, b: Set<string>): boolean => {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  };

  const renderStatusBubbles = (data: SchedulingProgressArtifact) => {
    const flow = data.flow ?? 'schedule';
    const steps = CANONICAL_STEPS[flow] ?? CANONICAL_STEPS.schedule;
    const completed = completedSetForData(data);

    if (renderedFlow === flow && setsEqual(renderedDone, completed)) {
      // Nothing visible to change — most common case during streaming
      // when the same tag arrives again on every re-render.
      return;
    }

    if (renderedFlow !== flow) {
      // Flow changed (or first render): rebuild the row from scratch.
      // This is rare in practice — flow doesn't switch mid-conversation.
      statusBubblesEl.innerHTML = '';
      for (const step of steps) {
        statusBubblesEl.appendChild(buildBubbleElement(step, completed.has(step.id)));
      }
    } else {
      // Same flow, completion set changed: walk existing bubbles and
      // only toggle the ones that flipped. The pop animation in CSS
      // is keyed to adding the `--done` class, so already-done bubbles
      // sit still and only the newly-completed bubble animates — which
      // is exactly the visual we want during streaming.
      const existing = Array.from(statusBubblesEl.children) as HTMLElement[];
      steps.forEach((step, i) => {
        const bubble = existing[i];
        if (!bubble) return;
        const wasDone = renderedDone.has(step.id);
        const isDone = completed.has(step.id);
        if (wasDone === isDone) return;
        if (isDone) flipBubbleDone(bubble, step);
        else unflipBubble(bubble, step);
      });
    }

    renderedFlow = flow;
    renderedDone = completed;
  };

  const applySchedulingProgress = (data: SchedulingProgressArtifact | null) => {
    if (!data) return;
    if (data.completed) {
      latestProgress = null;
      statusEl.hidden = true;
      statusLabelEl.textContent = '';
      statusBubblesEl.innerHTML = '';
      renderedFlow = null;
      renderedDone = new Set();
      return;
    }
    statusLabelEl.textContent = statusLabelForFlow(data.flow);
    renderStatusBubbles(data);
    statusEl.hidden = false;
    latestProgress = data;
  };

  const clearSchedulingProgress = () => {
    latestProgress = null;
    statusEl.hidden = true;
    statusLabelEl.textContent = '';
    statusBubblesEl.innerHTML = '';
    renderedFlow = null;
    renderedDone = new Set();
  };

  // Send-button loading spinner for tokenExchange users (anonymous === false)
  if (!anonymous) {
    const wsManager = config?.wsManager as LLMWebSocketManager | undefined;
    const updateSendButtons = () => {
      const loading = !wsManager?.isReady?.();
      modalSendBtn.classList.toggle('is-loading', loading);
      triggerSendBtn.classList.toggle('is-loading', loading);
    };
    updateSendButtons();
    if (wsManager?.onReadyChange) {
      unsubscribes.push(wsManager.onReadyChange(updateSendButtons));
    }
  }

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

  // Track the currently streaming message for in-place updates
  let streamingMsgId: string | null = null;
  let streamingBubbleEl: HTMLElement | null = null;
  let lastRenderedMessageCount = 0;
  let lastRenderedConvoId: string | null = null;
  // Gate sends while the assistant is mid-response — additional user
  // messages aren't incorporated into the in-flight reply.
  let isAssistantResponding = false;

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

    const visibleMessages = convo.messages.filter((msg) => !msg.text?.includes('{hidden_message}'));
    const approvalStatuses = buildApprovalStatuses(convo.messages);

    // Find the streaming message (if any)
    const lastMsg = visibleMessages[visibleMessages.length - 1];
    const streamingMsg = lastMsg?.role === 'assistant' && lastMsg.isStreaming ? lastMsg : null;
    const currentStreamId = streamingMsg?.id ?? null;
    const isThinking = streamingMsg && (!streamingMsg.text || streamingMsg.text === '…' || streamingMsg.text === '...');

    // Scan every visible message rather than just the last one. The
    // last-visible-message heuristic (`streamingMsg`) is correct for the
    // in-place fast-path render below, but it can miss a still-streaming
    // assistant reply when something else is rendered after it (a tool
    // result, a synthesized status message, etc.), reopening sends while
    // a stream is genuinely in flight.
    isAssistantResponding = visibleMessages.some(
      (m) => m.role === 'assistant' && m.isStreaming,
    );
    modalSendBtn.disabled = isAssistantResponding;
    triggerSendBtn.disabled = isAssistantResponding;
    suggestionButtons.forEach((btn) => {
      btn.disabled = isAssistantResponding;
    });

    // Fast path: if only the streaming message content changed, update in-place
    const structureChanged =
      convo.id !== lastRenderedConvoId ||
      visibleMessages.length !== lastRenderedMessageCount ||
      currentStreamId !== streamingMsgId;

    if (!structureChanged && streamingBubbleEl && streamingMsg && !isThinking) {
      // Fast path: update streaming content without rebuilding DOM structure
      const baseText = streamingMsg.text || '';
      const segments = splitArtifactSegments(baseText);
      const isPlainText = segments.length <= 1 && (!segments[0] || segments[0].type === 'text');

      if (isPlainText) {
        // For plain text streaming, update the paragraph innerHTML directly
        const textContent = isPlainText && segments[0]?.type === 'text' ? segments[0].value : baseText;
        const cleanedText = textContent
          .replace(/^`+\s*/gm, '')
          .replace(/\s*`+$/gm, '')
          .replace(/\n`+\n/g, '\n\n')
          .replace(/^\s*`+\s*$/gm, '')
          .trim();
        const firstP = streamingBubbleEl.querySelector('p');
        if (firstP && cleanedText) {
          firstP.innerHTML = parseMarkdown(cleanedText);
        } else if (cleanedText) {
          streamingBubbleEl.innerHTML = '';
          appendAssistantContent(streamingBubbleEl, streamingMsg);
        }
      } else {
        // For messages with artifacts, do a content rebuild
        streamingBubbleEl.innerHTML = '';
        appendAssistantContent(streamingBubbleEl, streamingMsg);
        // Disable animation on cards during streaming rebuild so they
        // don't replay the reveal animation on every incoming chunk
        streamingBubbleEl.querySelectorAll('.sunny-provider-card, .sunny-provider-search-results__provider').forEach(el => {
          (el as HTMLElement).style.animation = 'none';
          (el as HTMLElement).style.opacity = '1';
        });
        const approvalBlock = renderApprovalCards(streamingMsg, approvalStatuses, convo.id);
        if (approvalBlock) {
          streamingBubbleEl.appendChild(approvalBlock);
        }
      }
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }

    // Full rebuild
    messagesEl.innerHTML = '';
    streamingBubbleEl = null;
    streamingMsgId = currentStreamId;
    lastRenderedMessageCount = visibleMessages.length;
    // Clear pinned progress when the active conversation changes — progress
    // belongs to a flow, not the widget. Messages in the new conversation
    // will re-emit progress artifacts as they re-render.
    if (progressConversationId !== convo.id) {
      clearSchedulingProgress();
      progressConversationId = convo.id;
    }
    lastRenderedConvoId = convo.id;

    for (const msg of visibleMessages) {
      // Show thinking indicator as a standalone row when waiting for first token
      const msgIsThinking = msg.role === 'assistant' && msg.isStreaming && (!msg.text || msg.text === '…' || msg.text === '...');
      if (msgIsThinking) {
        const thinkingRow = document.createElement('div');
        thinkingRow.className = 'sunny-chat__thinking-row';
        thinkingRow.appendChild(createThinkingOrb(getThinkingStatus(msg)));
        messagesEl.appendChild(thinkingRow);
        continue;
      }

      const row = document.createElement('div');
      row.className = `sunny-chat__message sunny-chat__message--${msg.role}`;
      if (msg.role === 'assistant' && msg.isStreaming && msg.text) {
        row.classList.add('sunny-chat__message--streaming');
      }
      const bubble = buildMessageBubble(msg, convo.id, approvalStatuses);
      // Disable reveal animation for cards in already-completed messages
      // so they don't replay every time the DOM is rebuilt
      if (!msg.isStreaming) {
        bubble.querySelectorAll('.sunny-provider-card, .sunny-provider-search-results__provider').forEach(el => {
          (el as HTMLElement).style.animation = 'none';
          (el as HTMLElement).style.opacity = '1';
        });
      }
      // Skip rendering an empty assistant card. The most common case is a
      // standalone `{scheduling_progress}` message: appendAssistantContent
      // already fired the side-effect (the pinned bubbles updated) but the
      // bubble itself has no inline content — appending it would leave a
      // blank assistant row in the message stream. User messages and
      // streaming-thinking states are handled elsewhere.
      if (msg.role === 'assistant' && !msg.isStreaming && bubble.children.length === 0) {
        continue;
      }
      row.appendChild(bubble);
      messagesEl.appendChild(row);

      // Track the streaming bubble for future in-place updates
      if (msg === streamingMsg && !msgIsThinking) {
        streamingBubbleEl = bubble;
      }
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
      const paragraph = createParagraph(message.text || (message.isStreaming ? '…' : ''), false);
      if (paragraph) {
        bubble.appendChild(paragraph);
      }
    }

    return bubble;
  };

  const PROVIDER_SEARCH_TOOLS = new Set([
    // legacy mcp-external (removed in monorepo PR #469) + asksunny tools.
    // Kept here so older partner deployments and consumer chat still trigger
    // the "Reviewing real-time provider data..." status overlay.
    'search_providers',
    'search_provider_info',
    'search_providers_by_specialty_with_cost',
    // mcp-external location-grouped search tools introduced in PR #469.
    'search_providers_by_specialty',
    'search_locations_by_name',
    'find_provider_by_name',
    'get_location_providers',
  ]);
  const APPOINTMENT_REQUEST_TOOLS = new Set([
    'request_appointment',
    'schedule_appointment',
  ]);
  const PROVIDER_SEARCH_STATUS =
    'Reviewing real-time provider data for insurance network, location, and preferences';
  const APPOINTMENT_REQUEST_STATUS = 'Checking final details before starting the appointment request';
  const ALMOST_THERE_DELAY_MS = 3000;
  const GENERIC_SEND_FAILURE_MESSAGE = "Hm, something didn't go through. Let's give it another try.";

  const getThinkingStatus = (msg: SunnyAgentMessage): string => {
    const items = msg.outputItems;
    if (!items || items.length === 0) return 'Thinking';
    // Walk items in reverse to find the most recent activity
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (!item?.type) continue;
      if (item.type === 'mcp_approval_request') return 'Awaiting approval';
      if (
        item.type === 'function_call' ||
        item.type === 'function_call_output' ||
        item.type === 'mcp_call'
      ) {
        if (item.name && PROVIDER_SEARCH_TOOLS.has(item.name)) return PROVIDER_SEARCH_STATUS;
        if (item.name && APPOINTMENT_REQUEST_TOOLS.has(item.name)) return APPOINTMENT_REQUEST_STATUS;
        return 'Thinking';
      }
      if (item.type === 'web_search_call') return 'Searching';
      if (item.type === 'reasoning') return 'Reasoning';
      if (item.type === 'file_search_call') return 'Searching files';
      if (item.type === 'code_interpreter_call') return 'Running code';
      if (item.type === 'computer_call') return 'Using computer';
    }
    return 'Thinking';
  };

  const createThinkingOrb = (statusText?: string): HTMLElement => {
    const label = statusText || 'Thinking';
    const orb = document.createElement('div');
    orb.className = 'sunny-chat__thinking-orb';
    orb.innerHTML = `
      <div class="sunny-chat__thinking-dots">
        <div class="sunny-chat__thinking-dot"></div>
        <div class="sunny-chat__thinking-dot"></div>
        <div class="sunny-chat__thinking-dot"></div>
      </div>
      <span class="sunny-chat__thinking-label">${label}\u2026</span>
    `;
    if (label === 'Thinking') {
      const labelEl = orb.querySelector('.sunny-chat__thinking-label') as HTMLElement | null;
      if (labelEl) {
        setTimeout(() => {
          if (labelEl.isConnected && labelEl.textContent === 'Thinking\u2026') {
            labelEl.textContent = 'Almost there\u2026';
          }
        }, ALMOST_THERE_DELAY_MS);
      }
    }
    return orb;
  };

  const appendAssistantContent = (container: HTMLElement, message: SunnyAgentMessage) => {
    const baseText = message.text || (message.isStreaming ? '…' : '');
    const segments = splitArtifactSegments(baseText);
    if (!segments.length) {
      // segments comes back empty only when the artifact parser fully
      // consumed/truncated the input — i.e. the entire message was
      // tag content (a `{scheduling_progress}` ping with no surrounding
      // prose, or a partial open tag mid-stream). Rendering `baseText`
      // here would put the raw unprocessed tag back into the bubble,
      // which is the exact JSON leak users have complained about. The
      // correct behavior is to render nothing in this branch — the
      // side-effects (progress bubble updates, verification card
      // creation, etc.) already fired inside the segment iteration
      // (or, here, never fired, which is fine because there were no
      // matched tags to act on).
      return;
    }

    for (const segment of segments) {
      if (segment.type === 'text') {
        // Clean up backticks and extra whitespace around artifacts
        // Remove backticks that appear as formatting artifacts (at line boundaries or standalone)
        let cleanedText = segment.value
          .replace(/^`+\s*/gm, '') // Remove leading backticks at start of lines
          .replace(/\s*`+$/gm, '') // Remove trailing backticks at end of lines
          .replace(/\n`+\n/g, '\n\n') // Remove backticks on their own lines
          .replace(/^\s*`+\s*$/gm, '') // Remove lines that are only backticks
          .trim();

        if (cleanedText) {
          const paragraph = createParagraph(cleanedText, true);
          if (paragraph) {
            container.appendChild(paragraph);
          }
        }
      } else if (segment.type === 'expanded_profile') {
        const card = createExpandedProviderCard(segment.data);
        card.style.animationDelay = '0ms';
        container.appendChild(card);
      } else if (segment.type === 'minimal_profile') {
        const card = createMinimalProviderCard(segment.data);
        card.style.animationDelay = '0ms';
        container.appendChild(card);
      } else if (segment.type === 'legacy_profile') {
        const card = createLegacyProviderCard(segment.data);
        card.style.animationDelay = '0ms';
        container.appendChild(card);
      } else if (segment.type === 'provider_search_results') {
        // Append each provider card individually with staggered animation
        const providerCards = createProviderSearchResultsCard(segment.data);
        providerCards.forEach((card, index) => {
          card.style.animationDelay = `${index * 100}ms`;
          container.appendChild(card);
        });
      } else if (segment.type === 'location_search_results') {
        const cards = createLocationSearchResultsCard(segment.data);
        cards.forEach((card, index) => {
          card.style.animationDelay = `${index * 100}ms`;
          container.appendChild(card);
        });
      } else if (segment.type === 'provider_name_search_results') {
        const cards = createProviderNameSearchResultsCard(segment.data);
        cards.forEach((card, index) => {
          card.style.animationDelay = `${index * 100}ms`;
          container.appendChild(card);
        });
      } else if (segment.type === 'location_detail') {
        const card = createLocationDetailCard(segment.data);
        card.style.animationDelay = '0ms';
        container.appendChild(card);
      } else if (segment.type === 'verification_flow') {
        const autoStart = (segment.phone || segment.email) ? { phone: segment.phone, email: segment.email } : undefined;
        container.appendChild(createVerificationFlowComponent(passwordlessAuth, client, config, verificationPrefill, autoStart));
      } else if (segment.type === 'scheduling_progress') {
        // Progress artifacts render as a pinned bar at the top of the modal,
        // not inline in the bubble. Just update state here.
        applySchedulingProgress(segment.data);
      } else if (segment.type === 'email_confirm') {
        container.appendChild(createEmailConfirmCard(segment.email, client));
      }
    }
  };

  const parseMarkdown = (text: string): string => {
    // Escape HTML to prevent XSS
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Remove standalone backticks (formatting artifacts)
    // Remove backticks at start/end of lines and standalone single backticks
    html = html.replace(/^`+\s*/gm, ''); // Remove leading backticks at start of lines
    html = html.replace(/\s*`+$/gm, ''); // Remove trailing backticks at end of lines
    // Remove standalone single backticks (not preceded/followed by another backtick)
    html = html.replace(/([^`])`([^`])/g, '$1$2'); // Remove single backticks between non-backtick chars
    html = html.replace(/^`([^`])/gm, '$1'); // Remove leading single backtick
    html = html.replace(/([^`])`$/gm, '$1'); // Remove trailing single backtick

    // Parse links: [text](url) - do this first before other formatting
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="sunny-markdown-link">$1</a>');

    // Parse bold: **text** (handle this before italic to avoid conflicts)
    // Use a placeholder to avoid conflicts with italic parsing
    const boldPlaceholders: string[] = [];
    html = html.replace(/\*\*([^*]+?)\*\*/g, (match, content) => {
      const placeholder = `__BOLD_${boldPlaceholders.length}__`;
      boldPlaceholders.push(`<strong class="sunny-markdown-bold">${content}</strong>`);
      return placeholder;
    });

    // Parse italic: *text* (only single asterisks remaining)
    html = html.replace(/\*([^*\n]+?)\*/g, '<em class="sunny-markdown-italic">$1</em>');

    // Restore bold placeholders
    boldPlaceholders.forEach((replacement, index) => {
      html = html.replace(`__BOLD_${index}__`, replacement);
    });

    // Parse line breaks: \n becomes <br>
    html = html.replace(/\n/g, '<br>');

    return html;
  };

  const createParagraph = (text?: string | null, isAssistant: boolean = false) => {
    const trimmed = (text ?? '').trim();
    if (!trimmed) return null;
    const paragraph = document.createElement('p');

    if (isAssistant) {
      // Parse markdown for assistant messages
      paragraph.innerHTML = parseMarkdown(trimmed);
    } else {
      // Plain text for user messages
      paragraph.textContent = trimmed;
    }

    return paragraph;
  };

  // Optimistically render a user bubble immediately on send so the user gets
  // visual confirmation that the message was accepted, instead of seeing it
  // sit in the input for the duration of the createConversation/ws round-trip
  // (3-5s in authenticated mode). When the snapshot arrives, render() does a
  // structural rebuild and replaces this placeholder with the real bubble.
  const appendOptimisticUserBubble = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const row = document.createElement('div');
    row.className = 'sunny-chat__message sunny-chat__message--user';
    const bubble = document.createElement('div');
    bubble.className = 'sunny-chat__bubble';
    const paragraph = createParagraph(trimmed, false);
    if (paragraph) bubble.appendChild(paragraph);
    row.appendChild(bubble);
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
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

  const formatPhoneForDisplay = (value: string): string => {
    const digits = value.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return value;
  };

  const createVerificationFlowComponent = (
    authManager: PasswordlessAuthManager | undefined,
    client: SunnyAgentsClient,
    clientConfig: SunnyAgentsConfig | undefined,
    prefill?: { phone?: string },
    autoStart?: { phone?: string },
    pendingPrompt?: string,
    options?: {
      /** Called with the conversation id returned by sendMessage(pendingPrompt)
       *  so the outer scope can keep persistedConversationId in sync — without
       *  this, the user's next message can spawn yet another conversation. */
      onPendingPromptSent?: (conversationId: string) => void;
    },
  ): HTMLElement => {
    const card = document.createElement('div');
    card.className = 'sunny-verification-flow';

    if (!authManager) {
      card.classList.add('sunny-verification-flow--error');
      const errorMessage = document.createElement('div');
      errorMessage.className = 'sunny-verification-flow__error';
      errorMessage.textContent = 'Passwordless authentication is not configured. Please provide a PasswordlessAuthManager instance.';
      card.appendChild(errorMessage);
      return card;
    }

    // If the user already has a valid auth token at render time, the agent
    // shouldn't have emitted this tag — render nothing rather than flashing a
    // stale "you're verified" banner that confuses re-auth / alternative-
    // method flows. The agent continues with whatever it says after the tag.
    if (authManager.isAuthenticated()) {
      card.style.display = 'none';
      return card;
    }

    // Form state
    let waitingForCode = false;
    let currentPhone: string | null = null;
    let isSendingCode = false;
    let isVerifyingCode = false;
    // Set when OTP succeeded but the held pendingPrompt failed to deliver.
    // Putting the form in a third state (instead of either OTP-entry or
    // sending-OTP) so the action button reads "Retry sending" and the
    // submit handler routes to a fresh pendingPrompt send rather than
    // round-tripping a brand-new OTP for an already-verified user.
    let verifiedAwaitingSend = false;

    // If the agent passed a phone via the {verification_flow} tag, skip
    // the manual input step and auto-send the OTP to the known value.
    // Email autoStart values from the tag are ignored — this SDK is
    // phone-only since v0.0.62. The agent should stop emitting email
    // hints; until it does, we treat the email field as silently
    // dropped rather than blocking the flow.
    const autoStartedPhone = autoStart?.phone?.trim() || null;
    const hasAutoStart = !!autoStartedPhone;

    // Create form container
    const form = document.createElement('form');
    form.className = 'sunny-verification-flow__form';
    form.addEventListener('submit', (e) => e.preventDefault());

    // Input group: country picker + digit-bubble phone field. Email OTP
    // was removed in v0.0.62 — verification is phone-only.
    const inputGroup = document.createElement('div');
    inputGroup.className = 'sunny-verification-flow__input-group';

    // Reset post-success / post-OTP-sent UI when the user picks the "Use
    // a different phone" escape hatch. Keeps the form interactive after
    // a previously-rendered success state.
    const resetToFreshInput = () => {
      if (isSendingCode || isVerifyingCode) return;
      waitingForCode = false;
      currentPhone = null;
      clearCodeInputs();
      hideStatus();
      stopResendTimer();
      successMessage.style.display = 'none';
      form.style.display = '';
      codeGroup.style.display = 'none';
      useDifferentLink.style.display = 'none';
      updateUI();
    };

    // Phone row: country picker + digit-bubble phone input. Always
    // visible — no email toggle.
    const phoneRow = document.createElement('div');
    phoneRow.className = 'sunny-verification-flow__phone-row';

    const countryPicker = createCountryPicker('US');
    countryPicker.setDisabled(waitingForCode || isSendingCode);

    const phoneInput = createDigitBubblePhoneInput('US');
    phoneInput.setDisabled(waitingForCode || isSendingCode);
    if (prefill?.phone) {
      phoneInput.setDigits(prefill.phone);
    }
    countryPicker.onChange((iso) => {
      phoneInput.setIso(iso);
    });

    phoneRow.appendChild(countryPicker.el);
    phoneRow.appendChild(phoneInput.el);

    inputGroup.appendChild(phoneRow);

    // Code input (hidden initially) - 6 separate inputs for each digit
    const codeGroup = document.createElement('div');
    codeGroup.className = 'sunny-verification-flow__code-group';
    codeGroup.style.display = 'none';

    const codeInputsContainer = document.createElement('div');
    codeInputsContainer.className = 'sunny-verification-flow__code-inputs';
    const codeInputs: HTMLInputElement[] = [];

    // Create 6 separate input boxes
    for (let i = 0; i < 6; i++) {
      const codeInput = document.createElement('input');
      codeInput.type = 'text';
      codeInput.className = 'sunny-verification-flow__code-input';
      codeInput.maxLength = 1;
      codeInput.inputMode = 'numeric';
      codeInput.pattern = '[0-9]';
      codeInput.disabled = isVerifyingCode;
      codeInput.setAttribute('aria-label', `Digit ${i + 1} of verification code`);

      // Only allow numeric input
      codeInput.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        const value = target.value.replace(/\D/g, '');
        target.value = value.slice(0, 1);

        // Auto-focus next input if digit entered
        if (value && i < 5) {
          codeInputs[i + 1].focus();
        }
      });

      // Handle backspace to go to previous input
      codeInput.addEventListener('keydown', (e) => {
        const target = e.target as HTMLInputElement;
        if (e.key === 'Backspace' && !target.value && i > 0) {
          e.preventDefault();
          codeInputs[i - 1].focus();
        }
      });

      // Handle paste event
      codeInput.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedData = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        for (let j = 0; j < Math.min(pastedData.length, 6); j++) {
          codeInputs[j].value = pastedData[j];
        }
        // Focus the next empty input or the last one
        const nextEmptyIndex = Math.min(pastedData.length, 5);
        codeInputs[nextEmptyIndex].focus();
      });

      codeInputs.push(codeInput);
      codeInputsContainer.appendChild(codeInput);
    }

    codeGroup.appendChild(codeInputsContainer);

    // Resend code link — appears under the code inputs once a code has been
    // sent. Rate-limited by a 30-second countdown so users can't hammer the
    // OTP endpoint.
    const resendRow = document.createElement('div');
    resendRow.className = 'sunny-verification-flow__resend-row';
    const resendLink = document.createElement('button');
    resendLink.type = 'button';
    resendLink.className = 'sunny-verification-flow__resend';
    resendLink.textContent = 'Resend code';
    resendLink.disabled = true;
    resendRow.appendChild(resendLink);
    codeGroup.appendChild(resendRow);

    let resendTimerSeconds = 0;
    let resendTimerInterval: ReturnType<typeof setInterval> | null = null;
    const stopResendTimer = () => {
      if (resendTimerInterval) {
        clearInterval(resendTimerInterval);
        resendTimerInterval = null;
      }
    };
    const startResendTimer = () => {
      stopResendTimer();
      resendTimerSeconds = 30;
      resendLink.disabled = true;
      resendLink.textContent = `Resend code in ${resendTimerSeconds}s`;
      resendTimerInterval = setInterval(() => {
        // Auto-cleanup if the card was detached from the DOM.
        if (!document.body.contains(resendLink)) {
          stopResendTimer();
          return;
        }
        resendTimerSeconds -= 1;
        if (resendTimerSeconds <= 0) {
          stopResendTimer();
          resendLink.disabled = false;
          resendLink.textContent = 'Resend code';
        } else {
          resendLink.textContent = `Resend code in ${resendTimerSeconds}s`;
        }
      }, 1000);
    };

    resendLink.addEventListener('click', async () => {
      if (resendLink.disabled) return;
      if (isSendingCode || isVerifyingCode) return;
      if (!currentPhone) return;
      isSendingCode = true;
      resendLink.disabled = true;
      hideStatus();
      try {
        await authManager.startLogin({ phoneNumber: currentPhone });
        showStatus(`New code texted to ${formatPhoneForDisplay(currentPhone)}.`, 'success');
        clearCodeInputs();
        codeInputs[0]?.focus();
        startResendTimer();
      } catch (error) {
        showStatus(
          `Failed to resend: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error',
        );
        resendLink.disabled = false;
        resendLink.textContent = 'Resend code';
      } finally {
        isSendingCode = false;
        updateUI();
      }
    });

    // Helper function to get the full code from all inputs
    const getCode = (): string => {
      return codeInputs.map(input => input.value).join('');
    };

    // Helper function to clear all code inputs
    const clearCodeInputs = () => {
      codeInputs.forEach(input => {
        input.value = '';
      });
    };

    // Status message
    const statusMessage = document.createElement('div');
    statusMessage.className = 'sunny-verification-flow__status';

    // Action button
    const actionButton = document.createElement('button');
    actionButton.type = 'submit';
    actionButton.className = 'sunny-verification-flow__button';
    actionButton.textContent = 'Send Code';
    actionButton.disabled = isSendingCode || isVerifyingCode;

    // Success message (hidden initially — text is replaced with channel-aware
    // copy in the verify success branch before it becomes visible).
    const successMessage = document.createElement('div');
    successMessage.className = 'sunny-verification-flow__success';
    successMessage.style.display = 'none';
    successMessage.textContent = "All set — you're verified.";

    const updateUI = () => {
      if (verifiedAwaitingSend) {
        // OTP succeeded, but the held pendingPrompt didn't reach the agent.
        // Show a retry-send affordance. The phone row + OTP digit cells
        // aren't relevant here (user is already verified) — hide both
        // and just present the retry button alongside the error message
        // already on screen.
        actionButton.textContent = 'Retry sending';
        codeGroup.style.display = 'none';
        phoneRow.style.display = 'none';
      } else if (waitingForCode) {
        actionButton.textContent = 'Verify Code';
        codeGroup.style.display = 'block';
        phoneInput.setDisabled(true);
        countryPicker.setDisabled(true);
      } else {
        actionButton.textContent = 'Send Code';
        codeGroup.style.display = 'none';
        phoneInput.setDisabled(isSendingCode);
        countryPicker.setDisabled(isSendingCode);
      }
      codeInputs.forEach(input => {
        input.disabled = isVerifyingCode;
      });
      actionButton.disabled = isSendingCode || isVerifyingCode;
    };

    const showStatus = (message: string, type: 'success' | 'error' | 'info') => {
      statusMessage.textContent = message;
      statusMessage.className = `sunny-verification-flow__status sunny-verification-flow__status--${type}`;
      statusMessage.style.display = 'block';
    };

    const hideStatus = () => {
      statusMessage.style.display = 'none';
    };

    // Reused for both the initial post-OTP send and the "Retry sending"
    // button in the verifiedAwaitingSend state. Keeping the logic in one
    // place so the success/failure handling (persistedConversationId
    // sync, error rollback into verifiedAwaitingSend) can't drift between
    // the two entry points.
    const trySendPostAuthMessage = async () => {
      try {
        // Small delay to allow migration events to be processed (they arrive before auth.upgraded)
        await new Promise(resolve => setTimeout(resolve, 100));

        const snap = client.getSnapshot();
        const conversationId = snap.activeConversationId ?? snap.conversations[0]?.id;
        if (pendingPrompt) {
          // No `if (conversationId)` gate — sendMessage creates a new
          // conversation when the id is omitted, which is exactly the
          // case for a first-message auth-gated suggestion click.
          const result = await client.sendMessage(
            pendingPrompt,
            conversationId ? { conversationId } : {},
          );
          // Hand the resolved conversation id back to the outer scope so
          // persistedConversationId stays in sync. Without this, the
          // user's next message would target a stale id (or none) and
          // could spawn a second server conversation.
          if (result?.conversationId) {
            options?.onPendingPromptSent?.(result.conversationId);
          }
          // Successful send clears any prior retry-state from a failed
          // delivery attempt and reveals the success message.
          verifiedAwaitingSend = false;
          successMessage.style.display = 'block';
          form.style.display = 'none';
          hideStatus();
        } else if (conversationId) {
          await client.sendMessage('{hidden_message}"auth_success"{hidden_message/}', {
            conversationId,
          });
        }
      } catch (error) {
        if (pendingPrompt) {
          // The held prompt is the user's first real message — if it
          // didn't reach the agent, "you're verified" is half-true.
          // Enter the verifiedAwaitingSend state: hide the success card,
          // show the form (which under updateUI() will display only a
          // "Retry sending" button — no inputs, no OTP digits), and
          // surface the actual error inline. The action button will
          // re-route through this same helper rather than restarting
          // the OTP flow for an already-verified user.
          verifiedAwaitingSend = true;
          successMessage.style.display = 'none';
          form.style.display = '';
          isVerifyingCode = false;
          updateUI();
          showStatus(
            `Verified, but I couldn't send your request: ${error instanceof Error ? error.message : 'Unknown error'}. Tap Retry sending to try again.`,
            'error',
          );
        } else {
          // auth_success hidden ping is non-critical; keep the prior
          // log-and-continue behaviour.
          console.warn('[VanillaChat] Failed to send post-auth message:', error);
        }
      }
    };

    const handleSubmit = async () => {
      if (isSendingCode || isVerifyingCode) return;

      hideStatus();

      // verifiedAwaitingSend: OTP succeeded earlier but the held prompt
      // failed to deliver. The action button now reads "Retry sending"
      // and we route back through trySendPostAuthMessage instead of
      // re-running the OTP flow for an already-verified user. Reuse
      // isSendingCode as the in-flight guard so rapid double-clicks
      // can't fire concurrent sendMessage calls (the guard at the top
      // of handleSubmit already early-returns when isSendingCode is
      // true). updateUI() disables the action button and inputs while
      // the send is in flight; we restore both regardless of outcome.
      if (verifiedAwaitingSend) {
        isSendingCode = true;
        updateUI();
        try {
          await trySendPostAuthMessage();
        } finally {
          isSendingCode = false;
          updateUI();
        }
        return;
      }

      if (!waitingForCode) {
        // Start login flow — phone only.
        const phoneDigits = phoneInput.getDigits();
        const selectedIso = countryPicker.getIso();
        // Normalize to E.164 via libphonenumber-js so countries with trunk
        // prefixes (UK/DE/FR/IT/IN, etc.) get the leading 0 stripped
        // correctly. Naive `+${callingCode}${digits}` concatenation produced
        // invalid numbers for those locales and caused OTP delivery to fail.
        let phone = '';
        if (phoneDigits) {
          try {
            const parsed = parsePhoneNumberFromString(phoneDigits, selectedIso);
            phone = parsed?.isValid() ? parsed.format('E.164') : '';
          } catch {
            phone = '';
          }
        }

        if (!phoneDigits) {
          showStatus('Please enter your phone number', 'error');
          return;
        }
        if (!phone) {
          showStatus('That phone number doesn’t look quite right for the selected country. Mind double-checking?', 'error');
          return;
        }

        isSendingCode = true;
        updateUI();

        try {
          await authManager.startLogin({ phoneNumber: phone });
          currentPhone = phone;
          showStatus(`Verification code sent to ${phone}`, 'success');
          waitingForCode = true;
          isSendingCode = false;
          updateUI();
          clearCodeInputs();
          codeInputs[0].focus();
          startResendTimer();
        } catch (error) {
          showStatus(`Failed to send code: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
          isSendingCode = false;
          updateUI();
        }
      } else {
        // Verify code
        const code = getCode();
        if (!code || code.length !== 6) {
          showStatus('Please enter the complete 6-digit code', 'error');
          return;
        }
        if (!/^\d{6}$/.test(code)) {
          showStatus('Please enter a valid 6-digit code', 'error');
          return;
        }

        isVerifyingCode = true;
        updateUI();

        try {
          await authManager.verifyCode({
            phoneNumber: currentPhone ?? undefined,
            code,
          });

          const idToken = authManager.getIdToken();
          if (idToken && config?.tokenExchange) {
            // Update the client's token provider
            client.setIdTokenProvider(() => Promise.resolve(idToken));
          }

          successMessage.textContent = 'All set — your phone is verified.';
          successMessage.style.display = 'block';
          form.style.display = 'none';
          showStatus('', 'success');
          stopResendTimer();

          // Send the user's pending prompt (if any) or a hidden auth_success
          // signal to the LLM. The pending-prompt path covers the case where
          // the user clicked an auth-gated suggestion before authenticating —
          // we held the prompt back, did OTP, and now deliver the actual user
          // intent so the LLM responds to it directly instead of needing a
          // second round-trip after `auth_success`.
          await trySendPostAuthMessage();

          // Notify auth state change listeners
          authManager.onAuthStateChange(() => {
            // Auth state updated
          });
        } catch (error) {
          showStatus(`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
          isVerifyingCode = false;
          updateUI();
        }
      }
    };

    form.addEventListener('submit', handleSubmit);
    actionButton.addEventListener('click', handleSubmit);

    // "Use a different phone number" escape hatch — only visible once
    // we've auto-sent a code from the agent-provided phone. Clicking
    // reveals the normal input UI so the user can enter a different
    // number.
    const useDifferentLink = document.createElement('button');
    useDifferentLink.type = 'button';
    useDifferentLink.className = 'sunny-verification-flow__use-different';
    useDifferentLink.textContent = 'Use a different phone number';
    useDifferentLink.style.display = 'none';
    useDifferentLink.addEventListener('click', () => {
      // Common reset (state flags, code inputs, status, success banner,
      // form visibility). The escape-hatch-specific bits — restoring the
      // resend button copy, re-showing the phone row, clearing the
      // entered digits — sit alongside.
      resetToFreshInput();
      resendLink.textContent = 'Resend code';
      resendLink.disabled = true;
      phoneRow.style.display = 'flex';
      phoneInput.clear();
    });

    form.appendChild(inputGroup);
    form.appendChild(codeGroup);
    form.appendChild(statusMessage);
    form.appendChild(actionButton);
    form.appendChild(useDifferentLink);

    card.appendChild(form);
    card.appendChild(successMessage);

    // Auto-send the code if the agent already supplied a phone number.
    // Runs on next tick so the card is mounted before we fire the
    // request. Phone-only since v0.0.62 — any `autoStart.email` is
    // silently ignored upstream.
    if (hasAutoStart && authManager && autoStartedPhone) {
      phoneRow.style.display = 'none';
      actionButton.style.display = 'none';
      isSendingCode = true;
      const displayTarget = formatPhoneForDisplay(autoStartedPhone);
      showStatus(
        `Sending a 6-digit code by text to ${displayTarget} now.`,
        'info',
      );
      updateUI();

      setTimeout(async () => {
        try {
          await authManager.startLogin({ phoneNumber: autoStartedPhone });
          currentPhone = autoStartedPhone;
          waitingForCode = true;
          isSendingCode = false;
          showStatus(
            `Enter the 6-digit code we texted to ${displayTarget}.`,
            'success',
          );
          actionButton.style.display = '';
          useDifferentLink.style.display = 'inline-block';
          updateUI();
          clearCodeInputs();
          codeInputs[0]?.focus();
          startResendTimer();
        } catch (error) {
          // Auto-send failed — fall back to the manual input UI so the
          // user can correct the number and retry.
          isSendingCode = false;
          phoneRow.style.display = 'flex';
          actionButton.style.display = '';
          showStatus(
            `Failed to send code: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'error',
          );
          updateUI();
        }
      }, 0);
    }

    return card;
  };

  const createEmailConfirmCard = (email: string, client: SunnyAgentsClient): HTMLElement => {
    const card = document.createElement('div');
    card.className = 'sunny-email-confirm';

    const label = document.createElement('div');
    label.className = 'sunny-email-confirm__label';
    label.textContent = 'Is this email correct?';

    const emailDisplay = document.createElement('div');
    emailDisplay.className = 'sunny-email-confirm__email';
    emailDisplay.textContent = email;

    const actions = document.createElement('div');
    actions.className = 'sunny-email-confirm__actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'sunny-email-confirm__confirm';
    confirmBtn.textContent = "Yes, that's right";

    const changeBtn = document.createElement('button');
    changeBtn.type = 'button';
    changeBtn.className = 'sunny-email-confirm__change';
    changeBtn.textContent = 'Use a different email';

    actions.appendChild(confirmBtn);
    actions.appendChild(changeBtn);

    const changeForm = document.createElement('form');
    changeForm.className = 'sunny-email-confirm__change-form';
    changeForm.style.display = 'none';
    const newEmailInput = document.createElement('input');
    newEmailInput.type = 'email';
    newEmailInput.className = 'sunny-email-confirm__input';
    newEmailInput.placeholder = 'Enter a different email';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'sunny-email-confirm__save';
    saveBtn.textContent = 'Save';
    changeForm.appendChild(newEmailInput);
    changeForm.appendChild(saveBtn);

    const errorEl = document.createElement('div');
    errorEl.className = 'sunny-email-confirm__error';
    errorEl.style.display = 'none';

    const successEl = document.createElement('div');
    successEl.className = 'sunny-email-confirm__success';
    successEl.style.display = 'none';

    const sendHidden = async (payload: string) => {
      try {
        const snap = client.getSnapshot();
        const conversationId = snap.activeConversationId ?? snap.conversations[0]?.id;
        if (conversationId) {
          await client.sendMessage(payload, { conversationId });
        }
      } catch (err) {
        console.warn('[EmailConfirm] Failed to send hidden message:', err);
      }
    };

    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      changeBtn.disabled = true;
      actions.style.display = 'none';
      successEl.textContent = `✓ Email confirmed: ${email}`;
      successEl.style.display = 'block';
      await sendHidden('{hidden_message}"email_confirmed"{/hidden_message}');
    });

    changeBtn.addEventListener('click', () => {
      actions.style.display = 'none';
      changeForm.style.display = 'flex';
      newEmailInput.focus();
    });

    changeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newEmail = newEmailInput.value.trim();
      if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
        errorEl.textContent = 'Please enter a valid email address.';
        errorEl.style.display = 'block';
        return;
      }
      errorEl.style.display = 'none';
      saveBtn.disabled = true;
      newEmailInput.disabled = true;
      changeForm.style.display = 'none';
      successEl.textContent = `✓ Email updated: ${newEmail}`;
      successEl.style.display = 'block';
      await sendHidden(`{hidden_message}"email_updated:${newEmail}"{/hidden_message}`);
    });

    card.append(label, emailDisplay, actions, changeForm, errorEl, successEl);
    return card;
  };

  const createExpandedProviderCard = (data: any) => {
    const card = document.createElement('div');
    card.className = 'sunny-provider-card';
    // Expanded profiles have full data, render directly
    const profile = normalizeDoctorProfile(data);
    renderProviderProfile(card, profile);
    return card;
  };

  const createMinimalProviderCard = (data: any) => {
    const card = document.createElement('div');
    card.className = 'sunny-provider-card';

    if (!data || !data.npi) {
      card.classList.add('sunny-provider-card--error');
      const errorTitle = document.createElement('div');
      errorTitle.className = 'sunny-provider-card__error-title';
      errorTitle.textContent = 'Failed to load provider information';
      const errorMessage = document.createElement('div');
      errorMessage.className = 'sunny-provider-card__error-message';
      errorMessage.textContent = 'Missing provider NPI.';
      card.append(errorTitle, errorMessage);
      return card;
    }

    // Minimal profiles have: npi, optional rating/rank_score, optional mrf_rates, optional estimated_oop_cost
    // Render what we have - the card will show NPI and available fields
    const profile: ProviderCardViewModel = {
      name: `NPI ${data.npi}`, // Use NPI as identifier since we don't have name
      specialty: data.specialty,
      rating: data.rating || data.rank_score,
      estimatedOop: data.estimated_oop_cost,
    };

    renderProviderProfile(card, profile);
    return card;
  };

  const createLegacyProviderCard = (data: any) => {
    const card = document.createElement('div');
    card.className = 'sunny-provider-card';
    // Legacy profiles have full data structure, normalize and render
    const profile = normalizeDoctorProfile(data);
    renderProviderProfile(card, profile);
    return card;
  };

  const createProviderSearchResultsCard = (data: ProviderSearchResultsArtifact): HTMLElement[] => {
    if (!data || !Array.isArray(data.providers) || data.providers.length === 0) {
      const errorCard = document.createElement('div');
      errorCard.className = 'sunny-provider-search-results__error';
      errorCard.textContent = 'No providers found';
      return [errorCard];
    }

    // Return individual provider cards
    const cards: HTMLElement[] = [];

    data.providers.forEach((provider: ProviderResult) => {
      const providerCard = document.createElement('div');
      providerCard.className = 'sunny-provider-search-results__provider';

      // Get closest location for distance display
      let closestLocation: ProviderResult['locations'][0] | null = null;
      let distanceMiles: number | null = null;
      if (Array.isArray(provider.locations) && provider.locations.length > 0) {
        const sortedLocations = [...provider.locations].sort((a: any, b: any) =>
          (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity)
        );
        closestLocation = sortedLocations[0];
        distanceMiles = closestLocation.distance_miles ?? null;
      }

      // Provider name from name field (per documented structure)
      // Handle null name field and fallback to constructing from first_name/last_name if available
      let providerName: string | null = provider.name;

      // Fallback: if name is null, try to construct from first_name/last_name (for backward compatibility)
      if (!providerName) {
        const providerAny = provider as any;
        if (providerAny.first_name || providerAny.last_name) {
          const firstName = providerAny.first_name || '';
          const lastName = providerAny.last_name || '';
          providerName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
        }
      }

      // Additional fallback: use location name if provider name is still unavailable
      if (!providerName && closestLocation?.name) {
        providerName = closestLocation.name;
      }

      // Final fallback
      if (!providerName) {
        providerName = 'Unknown Provider';
      }

      // Initials from name field
      let initials = '?';
      if (providerName && providerName !== 'Unknown Provider') {
        const nameParts = providerName.split(' ').filter(Boolean);
        if (nameParts.length >= 2) {
          initials = `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
        } else if (nameParts.length === 1) {
          initials = nameParts[0].slice(0, 2).toUpperCase();
        }
      }

      // Content container (flex layout)
      const contentContainer = document.createElement('div');
      contentContainer.className = 'sunny-provider-search-results__provider-content';

      // Avatar column
      const avatarColumn = document.createElement('div');
      avatarColumn.className = 'sunny-provider-search-results__provider-avatar-column';

      // Avatar
      const avatar = document.createElement('div');
      avatar.className = 'sunny-provider-search-results__provider-avatar';
      avatar.textContent = initials || '?';
      avatarColumn.appendChild(avatar);

      // Distance below avatar
      if (distanceMiles !== null) {
        const distanceDiv = document.createElement('div');
        distanceDiv.className = 'sunny-provider-search-results__provider-distance';
        distanceDiv.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          <span>${distanceMiles.toFixed(1)} mi</span>
        `;
        avatarColumn.appendChild(distanceDiv);
      }

      contentContainer.appendChild(avatarColumn);

      // Info column
      const infoColumn = document.createElement('div');
      infoColumn.className = 'sunny-provider-search-results__provider-info-column';

      // Header with name and specialty
      const header = document.createElement('div');
      header.className = 'sunny-provider-search-results__provider-header';

      // Name row with provider name and location name
      const nameRow = document.createElement('div');
      nameRow.className = 'sunny-provider-search-results__provider-name-row';

      const nameEl = document.createElement('div');
      nameEl.className = 'sunny-provider-search-results__provider-name';
      nameEl.textContent = providerName;
      nameRow.appendChild(nameEl);

      // Location name inline next to provider name
      if (closestLocation?.name) {
        const locationNameEl = document.createElement('div');
        locationNameEl.className = 'sunny-provider-search-results__provider-location-name';
        locationNameEl.textContent = closestLocation.name;
        nameRow.appendChild(locationNameEl);
      }

      header.appendChild(nameRow);

      // Specialty
      if (Array.isArray(provider.specialties) && provider.specialties.length > 0) {
        const specialtyEl = document.createElement('div');
        specialtyEl.className = 'sunny-provider-search-results__provider-specialty';
        specialtyEl.textContent = provider.specialties.join(', ');
        header.appendChild(specialtyEl);
      }

      infoColumn.appendChild(header);

      // Location (address only, location name is now in header)
      if (closestLocation) {
        const addressParts = [
          closestLocation.address_line_1,
          closestLocation.address_line_2,
          closestLocation.city,
          closestLocation.state,
          closestLocation.zip
        ].filter(Boolean);
        const address = addressParts.join(', ');

        if (address) {
          const locationDiv = document.createElement('div');
          locationDiv.className = 'sunny-provider-search-results__provider-location';

          const locationNameEl = document.createElement('div');
          locationNameEl.className = 'sunny-provider-search-results__location-name';
          locationNameEl.textContent = address;
          locationDiv.appendChild(locationNameEl);

          infoColumn.appendChild(locationDiv);
        }
      }

      contentContainer.appendChild(infoColumn);
      providerCard.appendChild(contentContainer);
      cards.push(providerCard);
    });

    return cards;
  };

  // ===========================================================================
  // Location-grouped search artifact renderers (mcp-external PR #469).
  //
  // The flat `provider_search_results` shape rendered above iterates
  // providers and surfaces each provider's closest location. The three new
  // artifact types invert that — they're location-keyed, with matched
  // providers nested underneath. We surface each location as one card and
  // list the matched providers beneath the address. Same visual language
  // (.sunny-provider-search-results__* CSS classes); call-site staggered
  // animation works the same way.
  // ===========================================================================

  const formatProviderName = (p: NestedProvider): string => {
    const parts = [p.first_name, p.last_name].filter(Boolean);
    return parts.length ? parts.join(' ').trim() : 'Provider';
  };

  const computeInitials = (name: string): string => {
    const tokens = name.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      return `${tokens[0][0]}${tokens[tokens.length - 1][0]}`.toUpperCase();
    }
    if (tokens.length === 1) {
      return tokens[0].slice(0, 2).toUpperCase();
    }
    return '?';
  };

  const formatLocationAddress = (loc: LocationGroup): string => {
    if (loc.address) return loc.address;
    const parts = [loc.address_line_1, loc.address_line_2, loc.city, loc.state, loc.zip].filter(Boolean);
    return parts.join(', ');
  };

  /**
   * Render one card per [`LocationGroup`]. Each card surfaces the office
   * (name, address, distance) and lists the matched providers beneath as
   * compact rows. Used by `location_search_results` and reused with a
   * different header subtitle by `provider_name_search_results`.
   */
  const renderLocationGroupCard = (
    group: LocationGroup,
    options?: { subtitle?: string; partialMore?: number },
  ): HTMLElement => {
    const card = document.createElement('div');
    card.className = 'sunny-provider-search-results__provider';

    const content = document.createElement('div');
    content.className = 'sunny-provider-search-results__provider-content';

    // Avatar column — initials from location name when present, else first provider.
    const avatarColumn = document.createElement('div');
    avatarColumn.className = 'sunny-provider-search-results__provider-avatar-column';

    const headerName = group.location_name?.trim() || (
      group.providers[0] ? formatProviderName(group.providers[0]) : 'Location'
    );
    const avatar = document.createElement('div');
    avatar.className = 'sunny-provider-search-results__provider-avatar';
    avatar.textContent = computeInitials(headerName);
    avatarColumn.appendChild(avatar);

    if (group.distance_miles !== null && group.distance_miles !== undefined) {
      const distanceDiv = document.createElement('div');
      distanceDiv.className = 'sunny-provider-search-results__provider-distance';
      distanceDiv.textContent = `${group.distance_miles.toFixed(1)} mi`;
      avatarColumn.appendChild(distanceDiv);
    }

    content.appendChild(avatarColumn);

    // Info column.
    const infoColumn = document.createElement('div');
    infoColumn.className = 'sunny-provider-search-results__provider-info-column';

    const nameEl = document.createElement('div');
    nameEl.className = 'sunny-provider-search-results__provider-name';
    nameEl.textContent = headerName;
    infoColumn.appendChild(nameEl);

    if (options?.subtitle) {
      const subtitleEl = document.createElement('div');
      subtitleEl.className = 'sunny-provider-search-results__provider-subtitle';
      subtitleEl.textContent = options.subtitle;
      infoColumn.appendChild(subtitleEl);
    }

    const address = formatLocationAddress(group);
    if (address) {
      const locationDiv = document.createElement('div');
      locationDiv.className = 'sunny-provider-search-results__provider-location';
      const locationNameEl = document.createElement('div');
      locationNameEl.className = 'sunny-provider-search-results__location-name';
      locationNameEl.textContent = address;
      locationDiv.appendChild(locationNameEl);
      infoColumn.appendChild(locationDiv);
    }

    // Matched providers list (rows beneath the address).
    if (Array.isArray(group.providers) && group.providers.length > 0) {
      const list = document.createElement('div');
      list.className = 'sunny-provider-search-results__nested-providers';
      group.providers.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'sunny-provider-search-results__nested-provider-row';
        const name = formatProviderName(p);
        const specialty = (p.specialties && p.specialties[0]) || '';
        row.textContent = specialty ? `${name} — ${specialty}` : name;
        list.appendChild(row);
      });
      infoColumn.appendChild(list);
    }

    if (options?.partialMore && options.partialMore > 0) {
      const more = document.createElement('div');
      more.className = 'sunny-provider-search-results__partial-more';
      more.textContent = `+${options.partialMore} more — ask to see the full roster.`;
      infoColumn.appendChild(more);
    }

    content.appendChild(infoColumn);
    card.appendChild(content);
    return card;
  };

  const createLocationSearchResultsCard = (
    data: LocationSearchResultsArtifact,
  ): HTMLElement[] => {
    if (!data || !Array.isArray(data.locations) || data.locations.length === 0) {
      const errorCard = document.createElement('div');
      errorCard.className = 'sunny-provider-search-results__error';
      errorCard.textContent = 'No locations found';
      return [errorCard];
    }
    return data.locations.map((loc) =>
      renderLocationGroupCard(loc, {
        subtitle: loc.providers.length === 1
          ? '1 provider'
          : `${loc.providers.length} providers`,
      }),
    );
  };

  const createProviderNameSearchResultsCard = (
    data: ProviderNameSearchResultsArtifact,
  ): HTMLElement[] => {
    if (!data || !Array.isArray(data.locations) || data.locations.length === 0) {
      const errorCard = document.createElement('div');
      errorCard.className = 'sunny-provider-search-results__error';
      errorCard.textContent = 'No providers found';
      return [errorCard];
    }
    // For name search, the "headline" is the matched provider, not the
    // location. Override the card header to show the provider's name and
    // use the location name as the subtitle.
    return data.locations.map((loc) => {
      const matched = loc.providers[0];
      const providerHeading = matched ? formatProviderName(matched) : (loc.location_name || 'Provider');
      const officeSubtitle = loc.location_name || formatLocationAddress(loc);
      const headlineGroup: LocationGroup = {
        ...loc,
        // Repackage so renderLocationGroupCard's title is the provider name.
        location_name: providerHeading,
      };
      return renderLocationGroupCard(headlineGroup, { subtitle: officeSubtitle });
    });
  };

  const createLocationDetailCard = (data: LocationDetailArtifact): HTMLElement => {
    if (!data || !data.location) {
      const errorCard = document.createElement('div');
      errorCard.className = 'sunny-provider-search-results__error';
      errorCard.textContent = 'Location detail unavailable';
      return errorCard;
    }
    const subtitle = data.partial_results
      ? `${data.returned_count} providers (more available — increase group_size for the full roster)`
      : `${data.returned_count} provider${data.returned_count === 1 ? '' : 's'}`;
    return renderLocationGroupCard(data.location, {
      subtitle,
      // We don't know the precise overflow count when partial_results=true;
      // the heuristic "+more" line under the providers communicates that.
      partialMore: data.partial_results ? 1 : 0,
    });
  };

  const renderProviderProfile = (card: HTMLElement, profile: ProviderCardViewModel) => {
    card.classList.remove('sunny-provider-card--loading', 'sunny-provider-card--error');
    card.innerHTML = '';

    const content = document.createElement('div');
    content.className = 'sunny-provider-card__content';

    // Avatar placeholder
    const avatar = document.createElement('div');
    avatar.className = 'sunny-provider-card__avatar';
    const initials = profile.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
    avatar.textContent = initials || '?';

    const info = document.createElement('div');
    info.className = 'sunny-provider-card__info';

    const header = document.createElement('div');
    header.className = 'sunny-provider-card__header';

    const nameEl = document.createElement('div');
    nameEl.className = 'sunny-provider-card__name';
    nameEl.textContent = profile.name;

    const specialtyEl = document.createElement('div');
    specialtyEl.className = 'sunny-provider-card__specialty';
    specialtyEl.textContent = profile.specialty || 'Provider';

    header.append(nameEl, specialtyEl);

    const meta = document.createElement('ul');
    meta.className = 'sunny-provider-card__meta';

    if (profile.location) {
      const locationItem = document.createElement('li');
      locationItem.className = 'sunny-provider-card__meta-item';
      const locationLabel = document.createElement('span');
      locationLabel.className = 'sunny-provider-card__meta-label';
      locationLabel.textContent = 'Location:';
      const locationValue = document.createElement('span');
      locationValue.className = 'sunny-provider-card__meta-value';
      locationValue.textContent = profile.location;
      locationItem.append(locationLabel, locationValue);
      meta.appendChild(locationItem);
    }

    if (profile.phone) {
      const phoneItem = document.createElement('li');
      phoneItem.className = 'sunny-provider-card__meta-item';
      const phoneLabel = document.createElement('span');
      phoneLabel.className = 'sunny-provider-card__meta-label';
      phoneLabel.textContent = 'Phone:';
      const phoneValue = document.createElement('span');
      phoneValue.className = 'sunny-provider-card__meta-value';
      phoneValue.textContent = profile.phone;
      phoneItem.append(phoneLabel, phoneValue);
      meta.appendChild(phoneItem);
    }

    if (profile.languages && profile.languages.length > 0) {
      const languagesItem = document.createElement('li');
      languagesItem.className = 'sunny-provider-card__meta-item';
      const languagesLabel = document.createElement('span');
      languagesLabel.className = 'sunny-provider-card__meta-label';
      languagesLabel.textContent = 'Languages:';
      const languagesContainer = document.createElement('div');
      languagesContainer.className = 'sunny-provider-card__meta-value';
      const languagesTags = document.createElement('div');
      languagesTags.className = 'sunny-provider-card__languages';
      profile.languages.forEach(lang => {
        const tag = document.createElement('span');
        tag.className = 'sunny-provider-card__language-tag';
        tag.textContent = lang;
        languagesTags.appendChild(tag);
      });
      languagesContainer.appendChild(languagesTags);
      languagesItem.append(languagesLabel, languagesContainer);
      meta.appendChild(languagesItem);
    }

    if (profile.estimatedOop !== undefined) {
      const costItem = document.createElement('li');
      costItem.className = 'sunny-provider-card__meta-item';
      const costLabel = document.createElement('span');
      costLabel.className = 'sunny-provider-card__meta-label';
      costLabel.textContent = 'Est. Cost:';
      const costValue = document.createElement('span');
      costValue.className = 'sunny-provider-card__meta-value';
      costValue.textContent = formatCurrency(profile.estimatedOop);
      costItem.append(costLabel, costValue);
      meta.appendChild(costItem);
    }

    info.append(header);
    if (meta.children.length > 0) {
      info.appendChild(meta);
    }

    content.append(avatar, info);
    card.appendChild(content);
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

  const triggerSendRipple = (btn: HTMLElement) => {
    const ripple = document.createElement('span');
    ripple.className = 'sunny-chat__send-ripple';
    btn.appendChild(ripple);
    btn.classList.add('sunny-chat__send-btn--sending');
    setTimeout(() => {
      ripple.remove();
      btn.classList.remove('sunny-chat__send-btn--sending');
    }, 400);
  };

  const send = async () => {
    if (isAssistantResponding) return;
    const text = modalInput.value.trim();
    if (!text) return;
    // Clear input + render bubble + disable send before awaiting the network
    // round-trip — otherwise the text sits in the input for 3-5s (auth-mode
    // createConversation latency) and users spam-tap send. See appendOptimisticUserBubble.
    modalInput.value = '';
    modalSendBtn.disabled = true;
    triggerSendBtn.disabled = true;
    setExpanded(true);
    appendOptimisticUserBubble(text);
    try {
      const { conversationId } = await client.sendMessage(text, { conversationId: persistedConversationId });
      persistedConversationId = conversationId;
      render();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      console.error('[VanillaChat] Error sending message:', errorMessage);
      // Restore the text to the input so user can retry, and re-enable send.
      modalInput.value = text;
      modalSendBtn.disabled = false;
      triggerSendBtn.disabled = false;
      throw error; // Re-throw so handleModalSendClick can show alert
    }
  };

  const sendInitialMessage = async (text: string) => {
    if (isAssistantResponding) return;
    const trimmedText = text.trim();
    if (!trimmedText) return;
    // Clear inputs + render bubble + disable send immediately. Without this,
    // the message sits in modalInput for the createConversation round-trip and
    // users mash send → duplicate user messages.
    modalInput.value = '';
    triggerInput.value = '';
    modalSendBtn.disabled = true;
    triggerSendBtn.disabled = true;
    suggestionButtons.forEach((btn) => { btn.disabled = true; });
    setExpanded(true);
    appendOptimisticUserBubble(trimmedText);
    try {
      const { conversationId } = await client.sendMessage(trimmedText, { conversationId: persistedConversationId });
      persistedConversationId = conversationId;
      render();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      console.error('[VanillaChat] Error sending message:', errorMessage);
      modalInput.value = trimmedText;
      modalSendBtn.disabled = false;
      triggerSendBtn.disabled = false;
      suggestionButtons.forEach((btn) => { btn.disabled = false; });
      alert(GENERIC_SEND_FAILURE_MESSAGE);
    }
  };

  // Modal send button
  const handleModalSendClick = () => {
    triggerSendRipple(modalSendBtn);
    void send().catch((error) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      console.error('[VanillaChat] Error sending message:', errorMessage);
      alert(GENERIC_SEND_FAILURE_MESSAGE);
    });
  };
  modalSendBtn.addEventListener('click', handleModalSendClick);

  // Send from trigger input (first message)
  const sendFromTrigger = async () => {
    await sendInitialMessage(triggerInput.value);
  };

  // Trigger send button: send message and open modal
  const handleTriggerSendClick = () => {
    triggerSendRipple(triggerSendBtn);
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

  const suggestionClickHandlers = suggestionButtons.map((button) => {
    const prompt = button.dataset.suggestionPrompt ?? button.textContent ?? '';
    const requiresAuth = button.dataset.suggestionRequiresAuth === 'true';
    const handleSuggestionClick = () => {
      // Auth-gated suggestions: when the user is anonymous AND not
      // passwordless-authenticated, render the verification card
      // immediately and hold the prompt until verification succeeds. The
      // post-auth path in createVerificationFlowComponent then sends the
      // held prompt as the first real message. Hosts authenticated via
      // the SDK's token-exchange path (`anonymous === false`) are already
      // logged in and should fall through to the normal send — only
      // checking passwordlessAuth would force them into the OTP flow
      // unnecessarily. If neither auth mode is configured for an
      // anonymous user, the verification card renders its own
      // configuration-error message instead of silently sending the
      // gated prompt anyway (which would defeat the whole gate).
      const isHostAuthenticated =
        !anonymous || (passwordlessAuth?.isAuthenticated() ?? false);
      if (requiresAuth && !isHostAuthenticated) {
        setExpanded(true);
        appendOptimisticUserBubble(prompt);
        const row = document.createElement('div');
        row.className = 'sunny-chat__message sunny-chat__message--assistant';
        const bubble = document.createElement('div');
        bubble.className = 'sunny-chat__bubble';
        bubble.appendChild(
          createVerificationFlowComponent(
            passwordlessAuth,
            client,
            config,
            verificationPrefill,
            undefined,
            prompt,
            {
              onPendingPromptSent: (cid) => {
                persistedConversationId = cid;
              },
            },
          ),
        );
        row.appendChild(bubble);
        messagesEl.appendChild(row);
        messagesEl.scrollTop = messagesEl.scrollHeight;
        return;
      }
      void sendInitialMessage(prompt);
    };
    button.addEventListener('click', handleSuggestionClick);
    return { button, handleSuggestionClick };
  });

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
    client.on('conversationCreated', ({ conversationId }) => {
      // If server generated a different ID than our in-memory one, update our reference
      // This happens when authenticated and server creates the conversation
      if (conversationId !== persistedConversationId && !anonymous) {
        // Update our local in-memory reference for future sends
        persistedConversationId = conversationId;
      }
    }),
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
    suggestionClickHandlers.forEach(({ button, handleSuggestionClick }) => {
      button.removeEventListener('click', handleSuggestionClick);
    });
    // Clean up document event listeners
    document.removeEventListener('keydown', handleEscapeKey);
    // Restore body scroll
    document.body.style.overflow = '';
    if (root.parentElement === container) {
      container.removeChild(root);
    }
  };

  return {
    client,
    destroy,
    setPasswordlessAuth: (auth: PasswordlessAuthManager) => {
      passwordlessAuth = auth;
    },
  };
}

function ensureViewportMeta() {
  // Ensure interactive-widget=resizes-content is set on the viewport meta tag.
  // This makes the layout viewport shrink when the mobile keyboard opens,
  // so position:fixed elements (our modal) resize automatically via CSS.
  const existing = document.querySelector('meta[name="viewport"]');
  if (existing) {
    const content = existing.getAttribute('content') || '';
    if (!content.includes('interactive-widget')) {
      existing.setAttribute('content', content + ', interactive-widget=resizes-content');
    }
  } else {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1.0, interactive-widget=resizes-content';
    document.head.appendChild(meta);
  }
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  ensureViewportMeta();
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
  @import url('https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap');

  .sunny-chat {
    /* Theme colors - can be overridden via options */
    --sunny-color-primary: #006fff;
    --sunny-color-secondary: #212124;
    --sunny-color-accent: #22c55e;
    --sunny-color-background: #ffffff;
    --sunny-color-text: #212124;
    --sunny-color-muted-text: rgba(33, 33, 36, 0.64);
    --sunny-color-danger: #ef4444;
    --sunny-color-danger-hover: #dc2626;
    --sunny-panel-background: #e8edef;
    --sunny-chip-background: rgba(255, 255, 255, 0.82);
    --sunny-chip-border: color-mix(in srgb, var(--sunny-color-primary) 28%, transparent);
    --sunny-chip-text: var(--sunny-color-secondary);
    
    /* Typography - can be overridden via options */
    --sunny-font-size-base: 14px;
    --sunny-font-family: 'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    
    /* Dimensions - can be overridden via options */
    --sunny-modal-width: 1390px;
    --sunny-modal-height: 980px;
    --sunny-trigger-max-width: 600px;
    --sunny-panel-max-width: 1100px;
    
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
    /* Provider card tints - derived from primary */
    --sunny-color-primary-card-bg: color-mix(in srgb, var(--sunny-color-primary) 5%, white);
    --sunny-color-primary-card-bg-alt: color-mix(in srgb, var(--sunny-color-primary) 8%, white);
    --sunny-color-primary-border: color-mix(in srgb, var(--sunny-color-primary) 20%, transparent);
    --sunny-color-primary-border-hover: color-mix(in srgb, var(--sunny-color-primary) 30%, transparent);
    --sunny-color-primary-fill-10: color-mix(in srgb, var(--sunny-color-primary) 10%, white);
    --sunny-color-primary-fill-20: color-mix(in srgb, var(--sunny-color-primary) 20%, white);
    --sunny-color-primary-muted: color-mix(in srgb, var(--sunny-color-primary) 60%, white);
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
    --sunny-transition-spring: 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
    --sunny-transition-smooth: 300ms cubic-bezier(0.16, 1, 0.3, 1);
    
    font-family: var(--sunny-font-family);
    font-size: var(--sunny-font-size-base);
    color: var(--sunny-color-text);
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
    background: rgba(33, 33, 36, 0.85);
  }

  /* Modal Container */
  .sunny-chat-modal {
    position: relative;
    width: var(--sunny-modal-width);
    max-width: calc(100vw - 32px);
    height: var(--sunny-modal-height);
    max-height: calc(100vh - 64px);
    background: var(--sunny-color-background);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transform: scale(0.92) translateY(16px);
    opacity: 0;
    transition: transform var(--sunny-transition-spring), opacity 250ms ease;
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


  /* Pinned ambient status: shimmer label + completion-bubble row. Bubbles
     render in canonical chat-flow order and fill in any order as the agent
     reports completed step ids — out-of-order completion (e.g. user gives
     their group ID up front) just lights up the matching bubble. */
  .sunny-chat__status {
    padding: 40px 24px 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--sunny-color-background);
  }
  .sunny-chat__status[hidden] {
    display: none;
  }
  .sunny-chat__status-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sunny-chat__status-label {
    font-size: 0.82em;
    font-weight: 500;
    background: linear-gradient(
      90deg,
      var(--sunny-color-muted-text) 0%,
      var(--sunny-color-text) 50%,
      var(--sunny-color-muted-text) 100%
    );
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: sunny-chat-status-shimmer 2.6s linear infinite;
  }
  .sunny-chat__status-bubbles {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .sunny-chat__status-bubble {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid var(--sunny-gray-300);
    background: var(--sunny-color-background);
    color: transparent;
    transition: background 200ms ease, border-color 200ms ease, color 200ms ease, transform 200ms ease;
  }
  .sunny-chat__status-bubble svg {
    width: 10px;
    height: 10px;
  }
  .sunny-chat__status-bubble--done {
    background: var(--sunny-color-primary);
    border-color: var(--sunny-color-primary);
    color: var(--sunny-color-on-primary, #fff);
    animation: sunny-chat-status-bubble-pop 320ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes sunny-chat-status-shimmer {
    0% { background-position: 100% 0; }
    100% { background-position: -100% 0; }
  }
  @keyframes sunny-chat-status-bubble-pop {
    0% { transform: scale(0.6); }
    60% { transform: scale(1.18); }
    100% { transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .sunny-chat__status-label,
    .sunny-chat__status-bubble--done {
      animation: none;
    }
  }

  /* Messages Area */
  .sunny-chat__messages {
    flex: 1;
    overflow-y: auto;
    padding: 48px 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    background: var(--sunny-color-background);
    touch-action: pan-y;
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
    font-size: 1em;
    position: relative;
    z-index: 1;
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
    background: var(--sunny-color-background);
    color: var(--sunny-color-text);
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
  .sunny-chat__bubble p .sunny-markdown-bold {
    font-weight: 700;
    color: inherit;
  }
  .sunny-chat__bubble p .sunny-markdown-italic {
    font-style: italic;
    color: inherit;
  }
  .sunny-chat__bubble p .sunny-markdown-link {
    color: var(--sunny-color-primary);
    text-decoration: underline;
    text-underline-offset: 2px;
    transition: color var(--sunny-transition-fast);
  }
  .sunny-chat__bubble p .sunny-markdown-link:hover {
    color: var(--sunny-color-primary-hover);
  }
  .sunny-chat__bubble p .sunny-markdown-link:focus {
    outline: 2px solid var(--sunny-color-primary-ring);
    outline-offset: 2px;
    border-radius: 2px;
  }

  /* Shared Input Styles */
  .sunny-chat-modal__input,
  .sunny-chat__trigger-input {
    border: 1px solid var(--sunny-gray-300);
    background: var(--sunny-color-background);
    color: var(--sunny-color-text);
    font-size: 1.071em;
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
    padding: 16px 20px calc(20px + env(safe-area-inset-bottom, 0px));
    background: var(--sunny-color-background);
    border-top: 1px solid var(--sunny-gray-200);
    flex-shrink: 0;
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

  /* Embedded concierge panel */
  .sunny-chat--concierge {
    width: 100%;
  }
  .sunny-chat__concierge-shell {
    width: 100%;
    background: linear-gradient(180deg, color-mix(in srgb, var(--sunny-panel-background) 94%, white), var(--sunny-panel-background));
    border: 1px solid color-mix(in srgb, var(--sunny-chip-border) 45%, transparent);
    border-radius: 28px;
    box-shadow: 0 18px 40px rgba(13, 61, 77, 0.08);
    padding: 28px 30px 24px;
  }
  .sunny-chat__concierge-main {
    max-width: var(--sunny-panel-max-width);
    margin: 0 auto;
  }
  .sunny-chat__concierge-shell--center .sunny-chat__concierge-main {
    text-align: center;
  }
  .sunny-chat__concierge-intro {
    margin: 0 0 18px;
    color: var(--sunny-color-secondary);
    font-size: 1.08em;
    line-height: 1.6;
    max-width: 72ch;
  }
  .sunny-chat__concierge-intro strong {
    font-weight: 700;
    color: var(--sunny-color-text);
  }
  .sunny-chat__concierge-shell--center .sunny-chat__concierge-intro {
    margin-left: auto;
    margin-right: auto;
  }
  .sunny-chat__concierge-footer {
    margin-top: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px 18px;
    flex-wrap: wrap;
  }
  .sunny-chat__concierge-shell--center .sunny-chat__concierge-footer {
    justify-content: center;
  }
  .sunny-chat__suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .sunny-chat__suggestion-btn {
    border: 1px solid var(--sunny-chip-border);
    background: var(--sunny-chip-background);
    color: var(--sunny-chip-text);
    border-radius: 999px;
    padding: 9px 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: inherit;
    font-size: 0.95em;
    line-height: 1.2;
    cursor: pointer;
    transition:
      transform var(--sunny-transition-fast),
      border-color var(--sunny-transition-fast),
      background var(--sunny-transition-fast),
      box-shadow var(--sunny-transition-fast),
      color var(--sunny-transition-fast);
    box-shadow: 0 4px 12px rgba(13, 61, 77, 0.06);
  }
  .sunny-chat__suggestion-btn:hover {
    transform: translateY(-1px);
    border-color: color-mix(in srgb, var(--sunny-color-primary) 45%, transparent);
    background: color-mix(in srgb, var(--sunny-chip-background) 82%, white);
    color: var(--sunny-color-text);
  }
  .sunny-chat__suggestion-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 4px var(--sunny-color-primary-ring);
  }
  .sunny-chat__suggestion-btn--primary {
    background: var(--sunny-color-primary);
    border-color: var(--sunny-color-primary);
    color: #ffffff;
    font-weight: 600;
    padding: 11px 18px;
    box-shadow: 0 6px 18px color-mix(in srgb, var(--sunny-color-primary) 35%, transparent);
  }
  .sunny-chat__suggestion-btn--primary:hover {
    transform: translateY(-1px);
    background: var(--sunny-color-primary-hover, var(--sunny-color-primary));
    border-color: var(--sunny-color-primary-hover, var(--sunny-color-primary));
    color: #ffffff;
  }
  .sunny-chat__branding {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--sunny-color-muted-text);
    font-size: 0.9em;
  }
  .sunny-chat__branding-copy {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .sunny-chat__branding-mark {
    width: 14px;
    height: 14px;
    border: 1.5px solid currentColor;
    border-radius: 999px;
    display: inline-block;
    opacity: 0.7;
  }
  .sunny-chat__branding-link {
    color: var(--sunny-color-secondary);
    font-weight: 700;
    text-decoration: none;
  }
  .sunny-chat__branding-link:hover {
    text-decoration: underline;
  }

  /* Trigger Input */
  .sunny-chat__trigger {
    display: flex;
    align-items: center;
    position: relative;
    max-width: var(--sunny-trigger-max-width);
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
    overflow: hidden;
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
  @keyframes sunny-spin { to { transform: rotate(360deg); } }
  .sunny-chat__send-spinner {
    display: none;
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: sunny-spin 0.6s linear infinite;
  }
  .sunny-chat__send-btn.is-loading .sunny-chat__send-icon { display: none; }
  .sunny-chat__send-btn.is-loading .sunny-chat__send-spinner { display: block; }
  .sunny-chat-modal__composer .sunny-chat__send-btn {
    position: relative;
    right: auto;
  }

  /* Provider Card */
  .sunny-provider-card {
    margin: 12px 0;
    border: 1px solid var(--sunny-color-primary-border);
    border-radius: 12px;
    padding: 16px;
    background: linear-gradient(to bottom right, var(--sunny-color-primary-card-bg), var(--sunny-color-primary-card-bg-alt));
    box-shadow: var(--sunny-shadow-sm);
  }
  @media (hover: hover) {
    .sunny-provider-card {
      transition: box-shadow var(--sunny-transition-normal), border-color var(--sunny-transition-normal);
    }
    .sunny-provider-card:hover {
      box-shadow: var(--sunny-shadow-md);
      border-color: var(--sunny-color-primary-border-hover);
    }
  }
  .sunny-provider-card--loading {
    opacity: 1;
  }
  .sunny-provider-card--error {
    background: linear-gradient(to bottom right, rgba(254, 242, 242, 1), rgba(254, 242, 242, 0.8));
    border-color: rgba(239, 68, 68, 0.3);
  }
  .sunny-provider-card__content {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .sunny-provider-card__avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--sunny-color-primary-fill-10);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--sunny-color-primary-muted);
    font-size: 20px;
    font-weight: 600;
  }
  .sunny-provider-card__info {
    flex: 1;
    min-width: 0;
  }
  .sunny-provider-card__header {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
    margin-bottom: 8px;
  }
  .sunny-provider-card__name {
    font-weight: 700;
    font-size: 1.143em;
    color: var(--sunny-color-text);
    line-height: 1.4;
  }
  .sunny-provider-card__specialty {
    font-size: 1em;
    color: var(--sunny-gray-500);
    line-height: 1.4;
  }
  .sunny-provider-card__meta {
    list-style: none;
    margin: 12px 0 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sunny-provider-card__meta-item {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 1em;
    line-height: 1.5;
  }
  .sunny-provider-card__meta-label {
    font-size: 0.857em;
    color: var(--sunny-gray-500);
    font-weight: 500;
    min-width: 60px;
  }
  .sunny-provider-card__meta-value {
    font-size: 1em;
    color: var(--sunny-color-text);
    flex: 1;
  }
  .sunny-provider-card__languages {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }
  .sunny-provider-card__language-tag {
    display: inline-block;
    padding: 2px 8px;
    background: var(--sunny-color-primary-fill-10);
    border: 1px solid var(--sunny-color-primary-border);
    border-radius: 4px;
    font-size: 0.857em;
    color: var(--sunny-color-primary);
    font-weight: 500;
  }
  .sunny-provider-card__loading {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .sunny-provider-card__loading-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--sunny-color-primary-fill-20);
    flex-shrink: 0;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  .sunny-provider-card__loading-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sunny-provider-card__loading-line {
    height: 16px;
    background: var(--sunny-color-primary-fill-20);
    border-radius: 4px;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  .sunny-provider-card__loading-line--short {
    width: 75%;
  }
  .sunny-provider-card__loading-line--medium {
    width: 50%;
  }
  .sunny-provider-card__loading-line--long {
    width: 100%;
  }
  .sunny-provider-card__loading-text {
    font-size: 0.857em;
    color: var(--sunny-color-primary-muted);
    text-align: center;
    margin-top: 8px;
    opacity: 0.75;
  }
  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }
  .sunny-provider-card__error {
    padding: 16px;
  }
  .sunny-provider-card__error-title {
    font-weight: 600;
    font-size: 1.071em;
    color: #991b1b;
    margin-bottom: 4px;
  }
  .sunny-provider-card__error-message {
    font-size: 1em;
    color: #991b1b;
    margin-bottom: 8px;
  }
  .sunny-provider-card__error-id {
    font-size: 0.857em;
    color: #991b1b;
    opacity: 0.75;
  }

  /* Provider Search Results - Individual Cards */
  .sunny-provider-search-results__provider {
    margin: 12px 0;
    border: 1px solid var(--sunny-color-primary-border);
    border-radius: 12px;
    padding: 16px;
    background: linear-gradient(to bottom right, var(--sunny-color-primary-card-bg), var(--sunny-color-primary-card-bg-alt));
    box-shadow: var(--sunny-shadow-sm);
  }
  @media (hover: hover) {
    .sunny-provider-search-results__provider {
      transition: border-color var(--sunny-transition-fast), box-shadow var(--sunny-transition-fast);
    }
    .sunny-provider-search-results__provider:hover {
      border-color: var(--sunny-color-primary-border-hover);
      box-shadow: var(--sunny-shadow-md);
    }
  }
  .sunny-provider-search-results__provider-content {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }
  .sunny-provider-search-results__provider-avatar-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .sunny-provider-search-results__provider-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--sunny-color-primary-fill-10);
    border: 2px solid var(--sunny-color-primary-border);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--sunny-color-primary-muted);
    font-size: 20px;
    font-weight: 600;
    flex-shrink: 0;
  }
  .sunny-provider-search-results__provider-distance {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 0.857em;
    color: var(--sunny-gray-500);
    line-height: 1;
  }
  .sunny-provider-search-results__provider-distance svg {
    width: 12px;
    height: 12px;
    stroke: currentColor;
  }
  .sunny-provider-search-results__provider-info-column {
    flex: 1;
    min-width: 0;
  }
  .sunny-provider-search-results__provider-header {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 8px;
  }
  .sunny-provider-search-results__provider-name-row {
    display: flex;
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .sunny-provider-search-results__provider-name {
    font-weight: 700;
    font-size: 1.143em;
    color: var(--sunny-color-text);
    line-height: 1.4;
  }
  .sunny-provider-search-results__provider-location-name {
    font-size: 1em;
    color: var(--sunny-color-primary-muted);
    font-weight: 400;
    line-height: 1.4;
  }
  .sunny-provider-search-results__provider-location-name::before {
    content: '•';
    margin-right: 8px;
    color: var(--sunny-color-primary-muted);
  }
  .sunny-provider-search-results__provider-specialty {
    font-size: 0.857em;
    color: var(--sunny-color-primary);
    font-weight: 500;
    line-height: 1.4;
  }
  .sunny-provider-search-results__provider-location {
    margin-top: 8px;
  }
  .sunny-provider-search-results__location-name {
    font-size: 1em;
    color: var(--sunny-color-text);
    line-height: 1.5;
  }
  .sunny-provider-search-results__error {
    padding: 16px;
    text-align: center;
    color: var(--sunny-gray-500);
    font-size: 1em;
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
    font-size: 1.071em;
    color: var(--sunny-color-text);
  }
  .sunny-approval-card__status {
    margin-top: 4px;
    font-size: 0.786em;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--sunny-color-primary);
    font-weight: 700;
  }
  .sunny-approval-card__arguments {
    background: var(--sunny-color-background);
    border: 1px solid var(--sunny-gray-200);
    border-radius: 8px;
    padding: 12px;
    font-size: 0.857em;
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
    font-size: 1em;
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
    font-size: 0.929em;
    color: var(--sunny-color-danger);
    font-weight: 500;
  }

  /* Verification Flow */
  .sunny-verification-flow {
    margin: 12px 0;
    border: 1px solid var(--sunny-gray-200);
    border-radius: 12px;
    padding: 20px;
    background: var(--sunny-gray-50);
  }
  .sunny-verification-flow--error {
    border-color: var(--sunny-color-danger);
    background: #fef2f2;
  }
  .sunny-verification-flow__error {
    color: var(--sunny-color-danger);
    font-size: 1em;
    text-align: center;
    padding: 12px;
  }
  .sunny-verification-flow__form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .sunny-verification-flow__input-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sunny-verification-flow__phone-row {
    display: flex;
    gap: 8px;
    align-items: stretch;
  }

  /* Country picker (replaces native <select>) */
  .sunny-country-picker {
    position: relative;
    flex: 0 0 auto;
  }
  .sunny-country-picker__button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 12px 10px;
    border: 1px solid var(--sunny-gray-300);
    border-radius: 8px;
    background: var(--sunny-color-background);
    color: var(--sunny-color-text);
    cursor: pointer;
    font-family: inherit;
    font-size: 1.071em;
    line-height: 1;
    transition: border-color var(--sunny-transition-fast), box-shadow var(--sunny-transition-fast);
    outline: none;
  }
  .sunny-country-picker__button:focus-visible {
    border-color: var(--sunny-color-primary);
    box-shadow: 0 0 0 3px var(--sunny-color-primary-ring);
  }
  .sunny-country-picker__button:disabled {
    background: var(--sunny-gray-100);
    color: var(--sunny-gray-500);
    cursor: not-allowed;
  }
  .sunny-country-picker__flag {
    font-size: 1.2em;
    line-height: 1;
  }
  .sunny-country-picker__chevron {
    font-size: 0.65em;
    color: var(--sunny-color-muted-text);
    line-height: 1;
  }
  .sunny-country-picker__popover {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 20;
    width: 280px;
    max-width: calc(100vw - 48px);
    background: var(--sunny-color-background);
    border: 1px solid var(--sunny-gray-300);
    border-radius: 10px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.12);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .sunny-country-picker__popover[hidden] {
    display: none;
  }
  .sunny-country-picker__search {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border: none;
    border-bottom: 1px solid var(--sunny-gray-200);
    font-family: inherit;
    font-size: 0.92em;
    background: var(--sunny-color-background);
    color: var(--sunny-color-text);
    outline: none;
  }
  .sunny-country-picker__list {
    max-height: 240px;
    overflow-y: auto;
    padding: 4px 0;
  }
  .sunny-country-picker__row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.92em;
    color: var(--sunny-color-text);
  }
  .sunny-country-picker__row:hover,
  .sunny-country-picker__row--focused {
    background: var(--sunny-gray-100);
  }
  .sunny-country-picker__row--selected {
    font-weight: 600;
  }
  .sunny-country-picker__row-flag {
    font-size: 1.15em;
    line-height: 1;
    flex: 0 0 auto;
  }
  .sunny-country-picker__row-name {
    flex: 1 1 auto;
    min-width: 0;
    /* Allow long country names (e.g. "Saint Vincent and the Grenadines") to
       wrap to a second line inside the popover. The whole point of this
       picker is to surface the full name — truncating with ellipsis defeats
       that. Rows grow vertically as needed. */
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.25;
  }
  .sunny-country-picker__row-code {
    flex: 0 0 auto;
    color: var(--sunny-color-muted-text);
    font-variant-numeric: tabular-nums;
  }
  .sunny-country-picker__empty {
    padding: 12px;
    color: var(--sunny-color-muted-text);
    text-align: center;
    font-size: 0.9em;
  }

  /* Digit-bubble phone input (replaces single <input type="tel">) */
  .sunny-digit-phone {
    position: relative;
    flex: 1 1 0;
    min-width: 0; /* let the flex item shrink below content size on narrow */
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border: 1px solid var(--sunny-gray-300);
    border-radius: 8px;
    background: var(--sunny-color-background);
    cursor: text;
    transition: border-color var(--sunny-transition-fast), box-shadow var(--sunny-transition-fast);
    min-height: 44px;
    overflow: hidden;
  }
  .sunny-digit-phone--focused {
    border-color: var(--sunny-color-primary);
    box-shadow: 0 0 0 3px var(--sunny-color-primary-ring);
  }
  .sunny-digit-phone__cells {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1 1 auto;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .sunny-digit-phone__cells::-webkit-scrollbar {
    display: none;
  }
  .sunny-digit-phone__cell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 26px;
    padding: 0 2px;
    border-bottom: 2px solid var(--sunny-gray-300);
    font-size: 1.05em;
    font-variant-numeric: tabular-nums;
    color: var(--sunny-color-text);
    transition: border-color var(--sunny-transition-fast);
  }
  .sunny-digit-phone__cell--filled {
    border-bottom-color: var(--sunny-color-primary);
  }
  .sunny-digit-phone__cell--active {
    border-bottom-color: var(--sunny-color-primary);
    animation: sunny-digit-phone-caret 1s ease-in-out infinite;
  }
  .sunny-digit-phone__cell--overflow {
    border-bottom-color: var(--sunny-color-warning, #d97706);
  }
  .sunny-digit-phone__sep {
    display: inline-flex;
    align-items: flex-end;
    height: 26px;
    color: var(--sunny-color-muted-text);
    font-size: 0.95em;
    user-select: none;
  }
  .sunny-digit-phone__input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    border: none;
    background: transparent;
    cursor: text;
    font-size: 16px; /* prevent iOS zoom */
    color: transparent;
    caret-color: transparent;
  }
  .sunny-digit-phone__input:disabled {
    cursor: not-allowed;
  }
  @keyframes sunny-digit-phone-caret {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sunny-digit-phone__cell--active {
      animation: none;
    }
  }
  .sunny-verification-flow__input {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--sunny-gray-300);
    border-radius: 8px;
    font-size: 1.071em;
    font-family: inherit;
    background: var(--sunny-color-background);
    color: var(--sunny-color-text);
    transition: border-color var(--sunny-transition-fast), box-shadow var(--sunny-transition-fast);
    outline: none;
  }
  .sunny-verification-flow__input:focus {
    border-color: var(--sunny-color-primary);
    box-shadow: 0 0 0 3px var(--sunny-color-primary-ring);
  }
  .sunny-verification-flow__input:disabled {
    background: var(--sunny-gray-100);
    color: var(--sunny-gray-500);
    cursor: not-allowed;
  }
  .sunny-verification-flow__input::placeholder {
    color: var(--sunny-gray-500);
  }
  .sunny-verification-flow__code-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sunny-verification-flow__code-inputs {
    display: flex;
    gap: 8px;
    justify-content: center;
    max-width: 100%;
  }
  .sunny-verification-flow__code-input {
    width: 48px;
    height: 56px;
    padding: 0;
    border: 1px solid var(--sunny-gray-300);
    border-radius: 8px;
    font-size: 24px;
    font-weight: 600;
    text-align: center;
    font-family: inherit;
    background: var(--sunny-color-background);
    color: var(--sunny-color-text);
    transition: border-color var(--sunny-transition-fast), box-shadow var(--sunny-transition-fast);
    outline: none;
  }
  .sunny-verification-flow__code-input:focus {
    border-color: var(--sunny-color-primary);
    box-shadow: 0 0 0 3px var(--sunny-color-primary-ring);
  }
  .sunny-verification-flow__code-input:disabled {
    background: var(--sunny-gray-100);
    color: var(--sunny-gray-500);
    cursor: not-allowed;
  }
  .sunny-verification-flow__status {
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 1em;
    line-height: 1.5;
    display: none;
  }
  .sunny-verification-flow__status--success {
    background: var(--sunny-color-accent-bg);
    color: #15803d;
    border: 1px solid var(--sunny-color-accent);
  }
  .sunny-verification-flow__status--error {
    background: #fef2f2;
    color: var(--sunny-color-danger);
    border: 1px solid var(--sunny-color-danger);
  }
  .sunny-verification-flow__status--info {
    background: rgba(0, 111, 255, 0.1);
    color: var(--sunny-color-primary);
    border: 1px solid var(--sunny-color-primary);
  }
  .sunny-verification-flow__button {
    width: 100%;
    padding: 12px 20px;
    background: var(--sunny-color-primary);
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 1.071em;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--sunny-transition-fast), transform var(--sunny-transition-fast), box-shadow var(--sunny-transition-fast);
    font-family: inherit;
    box-shadow: 0 2px 8px var(--sunny-color-primary-shadow);
  }
  .sunny-verification-flow__button:hover:not(:disabled) {
    background: var(--sunny-color-primary-hover);
    box-shadow: 0 4px 12px var(--sunny-color-primary-shadow);
  }
  .sunny-verification-flow__button:active:not(:disabled) {
    transform: scale(0.98);
  }
  .sunny-verification-flow__button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .sunny-verification-flow__resend-row {
    display: flex;
    justify-content: center;
    margin-top: 4px;
  }
  .sunny-verification-flow__resend {
    background: transparent;
    border: none;
    padding: 4px 8px;
    font-family: inherit;
    font-size: 0.875em;
    color: var(--sunny-color-primary);
    cursor: pointer;
  }
  .sunny-verification-flow__resend:hover:not(:disabled) {
    text-decoration: underline;
  }
  .sunny-verification-flow__resend:disabled {
    color: var(--sunny-gray-500);
    cursor: not-allowed;
  }
  .sunny-verification-flow__use-different {
    align-self: center;
    margin-top: 4px;
    padding: 6px 4px;
    background: transparent;
    border: none;
    color: var(--sunny-color-primary);
    font-family: inherit;
    font-size: 0.875em;
    text-decoration: underline;
    cursor: pointer;
  }
  .sunny-verification-flow__use-different:hover {
    opacity: 0.8;
  }
  .sunny-verification-flow__use-different:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .sunny-email-confirm {
    padding: 16px;
    background: var(--sunny-color-primary-card-bg);
    border: 1px solid var(--sunny-color-primary-border);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 8px;
  }
  .sunny-email-confirm__label {
    font-size: 0.9em;
    color: var(--sunny-color-muted-text);
    font-weight: 500;
  }
  .sunny-email-confirm__email {
    font-size: 1em;
    font-weight: 600;
    color: var(--sunny-color-text);
    padding: 8px 12px;
    background: var(--sunny-color-background);
    border: 1px solid var(--sunny-gray-200);
    border-radius: 8px;
    word-break: break-all;
  }
  .sunny-email-confirm__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .sunny-email-confirm__confirm {
    flex: 1;
    min-width: 0;
    padding: 10px 16px;
    background: var(--sunny-color-primary);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.9375em;
    font-weight: 600;
    cursor: pointer;
    transition: background var(--sunny-transition-fast);
  }
  .sunny-email-confirm__confirm:hover:not(:disabled) {
    background: var(--sunny-color-primary-hover);
  }
  .sunny-email-confirm__confirm:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .sunny-email-confirm__change {
    flex: 1;
    min-width: 0;
    padding: 10px 16px;
    background: transparent;
    color: var(--sunny-color-primary);
    border: 1px solid var(--sunny-color-primary-border);
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.9375em;
    font-weight: 500;
    cursor: pointer;
    transition: border-color var(--sunny-transition-fast);
  }
  .sunny-email-confirm__change:hover:not(:disabled) {
    border-color: var(--sunny-color-primary-border-hover);
  }
  .sunny-email-confirm__change:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .sunny-email-confirm__change-form {
    display: flex;
    gap: 8px;
  }
  .sunny-email-confirm__input {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid var(--sunny-gray-300);
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.9375em;
    background: var(--sunny-color-background);
    color: var(--sunny-color-text);
    outline: none;
  }
  .sunny-email-confirm__input:focus {
    border-color: var(--sunny-color-primary);
    box-shadow: 0 0 0 3px var(--sunny-color-primary-ring);
  }
  .sunny-email-confirm__save {
    padding: 10px 16px;
    background: var(--sunny-color-primary);
    color: #ffffff;
    border: none;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.9375em;
    font-weight: 600;
    cursor: pointer;
  }
  .sunny-email-confirm__save:hover:not(:disabled) {
    background: var(--sunny-color-primary-hover);
  }
  .sunny-email-confirm__save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .sunny-email-confirm__error {
    color: #dc2626;
    font-size: 0.875em;
  }
  .sunny-email-confirm__success {
    padding: 10px 12px;
    background: var(--sunny-color-accent-bg);
    border: 1px solid var(--sunny-color-accent);
    border-radius: 8px;
    color: #15803d;
    font-size: 0.9375em;
    font-weight: 500;
  }
  .sunny-verification-flow__success {
    padding: 16px;
    background: var(--sunny-color-accent-bg);
    border: 1px solid var(--sunny-color-accent);
    border-radius: 8px;
    color: #15803d;
    font-size: 1em;
    font-weight: 500;
    text-align: center;
  }

  /* === Gemini-Inspired Animations === */

  /* Thinking Indicator */
  @keyframes sunny-thinking-wave {
    0%, 80%, 100% { transform: translateY(0); }
    40% { transform: translateY(-6px); }
  }
  .sunny-chat__thinking-row {
    align-self: flex-start;
    padding: 4px 0;
  }
  .sunny-chat__thinking-orb {
    display: inline-flex;
    align-items: center;
    padding: 12px 18px;
    background: var(--sunny-color-background);
    border: 1px solid var(--sunny-gray-200);
    border-radius: 14px 14px 14px 4px;
    box-shadow: var(--sunny-shadow-sm);
  }
  .sunny-chat__thinking-dots {
    display: flex;
    align-items: center;
    gap: 5px;
    position: relative;
    overflow: visible;
    padding: 6px 4px;
  }
  .sunny-chat__thinking-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--sunny-color-primary), var(--sunny-color-primary-muted));
    animation: sunny-thinking-wave 1.4s ease-in-out infinite;
    opacity: 0.7;
  }
  .sunny-chat__thinking-dot:nth-child(1) { animation-delay: 0s; }
  .sunny-chat__thinking-dot:nth-child(2) { animation-delay: 0.16s; }
  .sunny-chat__thinking-dot:nth-child(3) { animation-delay: 0.32s; }
  .sunny-chat__thinking-label {
    font-size: 0.857em;
    color: var(--sunny-gray-500);
    margin-left: 2px;
    white-space: nowrap;
  }

  /* Message Streaming Indicator */
  .sunny-chat__message--streaming {
    border-color: var(--sunny-color-primary-border);
  }

  /* Send Button Ripple */
  @keyframes sunny-send-ripple {
    0% { transform: scale(0); opacity: 0.5; }
    100% { transform: scale(2.5); opacity: 0; }
  }
  @keyframes sunny-send-burst {
    0% { transform: translate(-1px, 1px) scale(1) rotate(0deg); }
    30% { transform: translate(-1px, 1px) scale(0.6) rotate(45deg); }
    60% { transform: translate(-1px, 1px) scale(1.1) rotate(0deg); }
    100% { transform: translate(-1px, 1px) scale(1) rotate(0deg); }
  }
  .sunny-chat__send-ripple {
    position: absolute;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.4);
    animation: sunny-send-ripple 400ms ease-out forwards;
    pointer-events: none;
    top: 0;
    left: 0;
  }
  .sunny-chat__send-btn--sending .sunny-chat__send-icon {
    animation: sunny-send-burst 400ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* Artifact Card Reveals */
  @keyframes sunny-card-reveal {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .sunny-provider-card,
  .sunny-provider-search-results__provider {
    animation: sunny-card-reveal 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  /* Accessibility: Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .sunny-chat__thinking-dot,
    .sunny-provider-card,
    .sunny-provider-search-results__provider,
    .sunny-chat-modal-backdrop--open .sunny-chat-modal {
      animation: none !important;
    }
    .sunny-chat__thinking-dot,
    .sunny-provider-card,
    .sunny-provider-search-results__provider {
      opacity: 1 !important;
      transform: none !important;
    }
  }

  /* Responsive */
  @media (max-width: 640px) {
    .sunny-chat-modal {
      width: 100%;
      max-width: 100%;
      height: 100dvh;
      max-height: 100dvh;
      height: -webkit-fill-available; /* iOS Safari fallback */
      border-radius: 0;
    }
    .sunny-chat__trigger {
      max-width: 100%;
    }
    .sunny-chat__concierge-shell {
      padding: 20px 16px 18px;
      border-radius: 20px;
    }
    .sunny-chat__concierge-intro {
      font-size: 1em;
      margin-bottom: 14px;
    }
    .sunny-chat__concierge-footer {
      align-items: flex-start;
    }
    .sunny-chat__suggestions {
      gap: 8px;
    }
    .sunny-chat__suggestion-btn {
      width: 100%;
      justify-content: center;
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
    .sunny-verification-flow {
      padding: 14px;
    }
    .sunny-verification-flow__code-input {
      width: 36px;
      height: 44px;
      font-size: 18px;
      border-radius: 6px;
    }
    .sunny-verification-flow__code-inputs {
      gap: 6px;
    }
    /* Phone row: country picker is fixed-content-width (flag + chevron);
       phone field shrinks to fill remaining row. Both share a tight gap
       so the whole row fits comfortably at 320px. */
    .sunny-verification-flow__phone-row {
      gap: 6px;
      width: 100%;
    }
    .sunny-country-picker {
      flex: 0 0 auto;
    }
    .sunny-country-picker__button {
      padding: 10px 8px;
      font-size: 0.95em;
    }
    .sunny-country-picker__popover {
      width: min(280px, calc(100vw - 32px));
    }
    .sunny-digit-phone {
      padding: 6px 8px;
      min-width: 0;
    }
    .sunny-digit-phone__cells {
      gap: 2px;
    }
    .sunny-digit-phone__cell {
      min-width: 12px;
      height: 22px;
      padding: 0 1px;
      font-size: 0.95em;
    }
    .sunny-digit-phone__sep {
      height: 22px;
      font-size: 0.85em;
    }
    .sunny-verification-flow__input {
      padding: 10px 12px;
      font-size: 1em;
    }
    /* Progress bubbles row stays tight + wraps cleanly when the bubble
       count would otherwise overflow the chat width. */
    .sunny-chat__status {
      padding: 32px 16px 6px;
    }
    .sunny-chat__status-bubbles {
      gap: 6px;
    }
    .sunny-chat__thinking-dot {
      width: 7px;
      height: 7px;
    }
  }
  /* Extra-narrow phones (~320px). Drop the cell min-width and gap further
     so a 10–11 digit mask plus the country button never overflow. */
  @media (max-width: 360px) {
    .sunny-digit-phone {
      padding: 6px 6px;
    }
    .sunny-digit-phone__cells {
      gap: 1px;
    }
    .sunny-digit-phone__cell {
      min-width: 10px;
      padding: 0;
      font-size: 0.9em;
    }
    .sunny-digit-phone__sep {
      font-size: 0.8em;
    }
    .sunny-country-picker__button {
      padding: 10px 6px;
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

/**
 * Find the index of the first triple-backtick fence whose closing fence has
 * not yet arrived in `text`. Returns -1 when every fence is closed.
 */
function findUnclosedTripleBacktick(text: string): number {
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf('```', cursor);
    if (open === -1) return -1;
    const close = text.indexOf('```', open + 3);
    if (close === -1) return open;
    cursor = close + 3;
  }
  return -1;
}

function splitArtifactSegments(text: string): ArtifactSegment[] {
  if (!text) return [];

  // Defensive normalization. LLMs occasionally wrap artifact tags in markdown
  // code fences (single or triple backticks) or hallucinate square brackets
  // in place of curly braces. Unwrap and coerce *before* we look for tags so
  // the raw JSON body never reaches the chat bubble.
  //
  // Implementation note: we deliberately use indexOf/split loops rather than
  // regex with `\`+` quantifiers — patterns like /`+(\{tag\})`+/g exhibit
  // polynomial backtracking on inputs with many runs of backticks (CodeQL
  // js/polynomial-redos), and the input here is uncontrolled LLM text.
  const ARTIFACT_TAG_NAMES = [
    'scheduling_progress',
    'verification_flow',
    'email_confirm',
    'doctor_profile',
    'minimal_doctor_profile',
    'expanded_doctor_profile',
  ];
  for (const name of ARTIFACT_TAG_NAMES) {
    const openTag = `{${name}}`;
    const closeTag = `{/${name}}`;
    const openBracket = `[${name}]`;
    const closeBracket = `[/${name}]`;
    // Bracket-form coercion.
    if (text.includes(openBracket)) text = text.split(openBracket).join(openTag);
    if (text.includes(closeBracket)) text = text.split(closeBracket).join(closeTag);
    // Backtick fence stripping — bounded fence sizes (1 or 3 backticks). We
    // don't attempt to strip arbitrarily long backtick runs because such
    // inputs are pathological and the matched-pair pass below will still
    // truncate at the inner unclosed tag if anything slips through.
    for (const fence of ['```', '`']) {
      const wrappedOpen = `${fence}${openTag}${fence}`;
      const wrappedClose = `${fence}${closeTag}${fence}`;
      if (text.includes(wrappedOpen)) text = text.split(wrappedOpen).join(openTag);
      if (text.includes(wrappedClose)) text = text.split(wrappedClose).join(closeTag);
    }
  }

  // Streaming artifact tags (long JSON bodies like {scheduling_progress}) span
  // multiple LLM tokens. Between the opening marker and the close arriving,
  // the raw body would otherwise flash as plain text in the bubble. Truncate
  // the text at the earliest unclosed opening so nothing renders until the
  // close lands on a later chunk.
  const ARTIFACT_TAG_PAIRS: [string, string][] = [
    [EXPANDED_DOCTOR_PROFILE_START, EXPANDED_DOCTOR_PROFILE_END],
    [MINIMAL_DOCTOR_PROFILE_START, MINIMAL_DOCTOR_PROFILE_END],
    [DOCTOR_PROFILE_START, DOCTOR_PROFILE_END],
    [VERIFICATION_FLOW_START, VERIFICATION_FLOW_END],
    [SCHEDULING_PROGRESS_START, SCHEDULING_PROGRESS_END],
    [EMAIL_CONFIRM_START, EMAIL_CONFIRM_END],
  ];
  let unclosedAt = text.length;
  for (const [openTag, closeTag] of ARTIFACT_TAG_PAIRS) {
    let pos = 0;
    while (pos < text.length) {
      const openIdx = text.indexOf(openTag, pos);
      if (openIdx === -1) break;
      const closeIdx = text.indexOf(closeTag, openIdx + openTag.length);
      if (closeIdx === -1) {
        if (openIdx < unclosedAt) unclosedAt = openIdx;
        break;
      }
      pos = closeIdx + closeTag.length;
    }
  }

  // The matched-pair pass above only hides text after a *complete* open tag.
  // While the LLM is still typing the open tag itself (text ends in
  // `{schedul`, `{verification_flo`, etc.) the partial tag would otherwise
  // flash as raw text. Detect any trailing prefix of a known open tag and
  // hide it too.
  for (const [openTag] of ARTIFACT_TAG_PAIRS) {
    const maxLen = Math.min(openTag.length - 1, text.length);
    for (let len = maxLen; len >= 1; len--) {
      if (text.endsWith(openTag.slice(0, len))) {
        const cutAt = text.length - len;
        if (cutAt < unclosedAt) unclosedAt = cutAt;
        break;
      }
    }
  }

  // Triple-backtick code fences. When the LLM wraps an artifact body in a
  // ```json fence, the raw fence + body would flash as code in the bubble
  // before the artifact replaces it. Hide everything from an unclosed fence
  // onward (and from any trailing prefix of a fence still being typed).
  const fenceIdx = findUnclosedTripleBacktick(text);
  if (fenceIdx !== -1 && fenceIdx < unclosedAt) unclosedAt = fenceIdx;
  for (let len = 2; len >= 1; len--) {
    if (text.endsWith('`'.repeat(len))) {
      const cutAt = text.length - len;
      if (cutAt < unclosedAt) unclosedAt = cutAt;
      break;
    }
  }

  if (unclosedAt < text.length) {
    text = text.slice(0, unclosedAt);
  }

  // Strip *closed* triple-backtick code blocks — chat bubbles never
  // legitimately render code. Skip any fence whose body contains a known
  // artifact opener so the artifact path below still finds and renders
  // the card. The LLM occasionally wraps artifact bodies in a ```json
  // fence, in either the {tag}…{/tag} form or the raw `item_type`
  // ChatArtifact JSON form (handled by the brace-walker below).
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    if (ARTIFACT_TAG_PAIRS.some(([openTag]) => match.includes(openTag))) {
      return match;
    }
    if (match.includes('"item_type"')) {
      return match;
    }
    return '';
  });

  const segments: ArtifactSegment[] = [];
  let cursor = 0;

  // Find all tag positions
  type TagMatch = { type: 'expanded' | 'minimal' | 'legacy' | 'provider_search_results' | 'location_search_results' | 'provider_name_search_results' | 'location_detail' | 'verification_flow' | 'scheduling_progress' | 'email_confirm'; start: number; end: number; data?: any; action?: string; phone?: string; email?: string };
  const tagMatches: TagMatch[] = [];

  // Find raw JSON doctor profile objects (ChatArtifact format with item_type: "doctor_profile")
  // These appear as raw JSON objects in the text, e.g., {"item_type":"doctor_profile","item_content":{...}}
  let jsonCursor = 0;
  while (jsonCursor < text.length) {
    // Look for JSON object start
    const start = text.indexOf('{', jsonCursor);
    if (start === -1) break;

    // Try to find the matching closing brace by counting braces
    let braceCount = 0;
    let end = start;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          end = i + 1;
          break;
        }
      }
    }

    if (braceCount === 0 && end > start) {
      // Found a complete JSON object, try to parse it
      const jsonStr = text.slice(start, end).trim();
      try {
        const artifact = JSON.parse(jsonStr);
        // Check if it's a doctor profile artifact (item_type can appear anywhere in the object)
        if (artifact && typeof artifact === 'object' && artifact.item_type === 'doctor_profile' && artifact.item_content) {
          // Extract item_content and create a legacy profile segment
          tagMatches.push({ type: 'legacy', start, end, data: artifact.item_content });
        }
        // Check if it's a provider search results artifact (legacy flat shape;
        // emitted by asksunny + the removed mcp-external `search_providers` tool).
        else if (artifact && typeof artifact === 'object' && artifact.item_type === 'provider_search_results' && artifact.item_content) {
          // Extract item_content and create a provider search results segment
          tagMatches.push({ type: 'provider_search_results', start, end, data: artifact.item_content });
        }
        // mcp-external location-grouped variants (PR #469).
        else if (artifact && typeof artifact === 'object' && artifact.item_type === 'location_search_results' && artifact.item_content) {
          tagMatches.push({ type: 'location_search_results', start, end, data: artifact.item_content });
        }
        else if (artifact && typeof artifact === 'object' && artifact.item_type === 'provider_name_search_results' && artifact.item_content) {
          tagMatches.push({ type: 'provider_name_search_results', start, end, data: artifact.item_content });
        }
        else if (artifact && typeof artifact === 'object' && artifact.item_type === 'location_detail' && artifact.item_content) {
          tagMatches.push({ type: 'location_detail', start, end, data: artifact.item_content });
        }
      } catch {
        // Invalid JSON, skip
      }
    }

    jsonCursor = end > start ? end : start + 1;
  }

  // Find expanded doctor profile tags
  let expandedCursor = 0;
  while (expandedCursor < text.length) {
    const start = text.indexOf(EXPANDED_DOCTOR_PROFILE_START, expandedCursor);
    if (start === -1) break;
    const jsonStart = start + EXPANDED_DOCTOR_PROFILE_START.length;
    const end = text.indexOf(EXPANDED_DOCTOR_PROFILE_END, jsonStart);
    if (end === -1) break;
    const jsonStr = text.slice(jsonStart, end).trim();
    try {
      const data = JSON.parse(jsonStr);
      tagMatches.push({ type: 'expanded', start, end: end + EXPANDED_DOCTOR_PROFILE_END.length, data });
    } catch {
      // Invalid JSON, skip
    }
    expandedCursor = end + EXPANDED_DOCTOR_PROFILE_END.length;
  }

  // Find minimal doctor profile tags
  let minimalCursor = 0;
  while (minimalCursor < text.length) {
    const start = text.indexOf(MINIMAL_DOCTOR_PROFILE_START, minimalCursor);
    if (start === -1) break;
    const jsonStart = start + MINIMAL_DOCTOR_PROFILE_START.length;
    const end = text.indexOf(MINIMAL_DOCTOR_PROFILE_END, jsonStart);
    if (end === -1) break;
    const jsonStr = text.slice(jsonStart, end).trim();
    try {
      const data = JSON.parse(jsonStr);
      tagMatches.push({ type: 'minimal', start, end: end + MINIMAL_DOCTOR_PROFILE_END.length, data });
    } catch {
      // Invalid JSON, skip
    }
    minimalCursor = end + MINIMAL_DOCTOR_PROFILE_END.length;
  }

  // Find legacy doctor profile tags
  let legacyCursor = 0;
  while (legacyCursor < text.length) {
    const start = text.indexOf(DOCTOR_PROFILE_START, legacyCursor);
    if (start === -1) break;
    const jsonStart = start + DOCTOR_PROFILE_START.length;
    const end = text.indexOf(DOCTOR_PROFILE_END, jsonStart);
    if (end === -1) break;
    const jsonStr = text.slice(jsonStart, end).trim();
    try {
      const data = JSON.parse(jsonStr);
      tagMatches.push({ type: 'legacy', start, end: end + DOCTOR_PROFILE_END.length, data });
    } catch {
      // Invalid JSON, skip
    }
    legacyCursor = end + DOCTOR_PROFILE_END.length;
  }

  // Find verification flow tags
  let verificationCursor = 0;
  while (verificationCursor < text.length) {
    const start = text.indexOf(VERIFICATION_FLOW_START, verificationCursor);
    if (start === -1) break;
    const contentStart = start + VERIFICATION_FLOW_START.length;
    const end = text.indexOf(VERIFICATION_FLOW_END, contentStart);
    if (end === -1) break;
    // Body is either a legacy quoted action string ("init") or a JSON object:
    // {"phone":"+15555550123","email":"a@b.com","action":"init"}. If phone or
    // email is present the modal skips the input step and auto-sends the code.
    const content = text.slice(contentStart, end).trim();
    let action = 'init';
    let phone: string | undefined;
    let email: string | undefined;
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.action === 'string') action = parsed.action;
        if (typeof parsed.phone === 'string' && parsed.phone.trim()) phone = parsed.phone.trim();
        if (typeof parsed.email === 'string' && parsed.email.trim()) email = parsed.email.trim();
      } else if (typeof parsed === 'string' && parsed) {
        action = parsed;
      }
    } catch {
      action = content.replace(/^["']|["']$/g, '') || 'init';
    }
    tagMatches.push({ type: 'verification_flow', start, end: end + VERIFICATION_FLOW_END.length, action, phone, email });
    verificationCursor = end + VERIFICATION_FLOW_END.length;
  }

  // Find scheduling progress tags. The tag span is *always* consumed (added
  // to tagMatches) regardless of body shape — the SDK no longer renders a
  // visible progress indicator from this artifact, and the only purpose of
  // recognising it here is to keep the raw `{scheduling_progress}{...}` JSON
  // body out of the chat bubble. Attempt JSON.parse for back-compat in case
  // any consumer is reading `data`, but never gate consumption on it.
  let progressCursor = 0;
  while (progressCursor < text.length) {
    const start = text.indexOf(SCHEDULING_PROGRESS_START, progressCursor);
    if (start === -1) break;
    const contentStart = start + SCHEDULING_PROGRESS_START.length;
    const end = text.indexOf(SCHEDULING_PROGRESS_END, contentStart);
    if (end === -1) break;
    const body = text.slice(contentStart, end).trim();
    let parsed: SchedulingProgressArtifact | null = null;
    try {
      const maybe = JSON.parse(body);
      if (maybe && typeof maybe === 'object') {
        parsed = maybe as SchedulingProgressArtifact;
      }
    } catch {
      // Body wasn't valid JSON — fall through with null data. We still
      // consume the span below so it doesn't leak as text.
    }
    tagMatches.push({
      type: 'scheduling_progress',
      start,
      end: end + SCHEDULING_PROGRESS_END.length,
      data: parsed,
    });
    progressCursor = end + SCHEDULING_PROGRESS_END.length;
  }

  // Find email confirm tags. Body is a JSON object with an "email" field.
  // Used for the "And just to double-check, is your email X?" confirmation
  // step — no email is sent, this is purely a yes/update prompt.
  let emailConfirmCursor = 0;
  while (emailConfirmCursor < text.length) {
    const start = text.indexOf(EMAIL_CONFIRM_START, emailConfirmCursor);
    if (start === -1) break;
    const contentStart = start + EMAIL_CONFIRM_START.length;
    const end = text.indexOf(EMAIL_CONFIRM_END, contentStart);
    if (end === -1) break;
    const body = text.slice(contentStart, end).trim();
    let email: string | undefined;
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === 'object' && typeof parsed.email === 'string') {
        email = parsed.email.trim();
      }
    } catch {
      // Ignore malformed JSON — the tag span is still consumed below.
    }
    if (email) {
      tagMatches.push({
        type: 'email_confirm',
        start,
        end: end + EMAIL_CONFIRM_END.length,
        email,
      });
    }
    emailConfirmCursor = end + EMAIL_CONFIRM_END.length;
  }

  // Sort matches by position
  tagMatches.sort((a, b) => a.start - b.start);

  // Build segments
  for (const match of tagMatches) {
    // Add text before this tag
    if (match.start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, match.start) });
    }

    // Add the profile segment
    if (match.type === 'expanded') {
      segments.push({ type: 'expanded_profile', data: match.data });
    } else if (match.type === 'minimal') {
      segments.push({ type: 'minimal_profile', data: match.data });
    } else if (match.type === 'legacy') {
      segments.push({ type: 'legacy_profile', data: match.data });
    } else if (match.type === 'provider_search_results') {
      segments.push({ type: 'provider_search_results', data: match.data });
    } else if (match.type === 'location_search_results') {
      segments.push({ type: 'location_search_results', data: match.data });
    } else if (match.type === 'provider_name_search_results') {
      segments.push({ type: 'provider_name_search_results', data: match.data });
    } else if (match.type === 'location_detail') {
      segments.push({ type: 'location_detail', data: match.data });
    } else if (match.type === 'verification_flow') {
      segments.push({ type: 'verification_flow', action: match.action || 'init', phone: match.phone, email: match.email });
    } else if (match.type === 'scheduling_progress' && match.data) {
      segments.push({ type: 'scheduling_progress', data: match.data });
    } else if (match.type === 'email_confirm' && match.email) {
      segments.push({ type: 'email_confirm', email: match.email });
    }

    cursor = match.end;
  }

  // Add remaining text
  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }

  // Final safety net: nuke any leftover line that mentions a known
  // artifact tag name in a text segment. The structured parser handles
  // canonical `{tag}...{/tag}` spans and the normalized backtick /
  // square-bracket variants. But the LLM can hallucinate forms we
  // don't predict — `[scheduling_progress: {flow: ...}]` (single span,
  // payload inside square brackets, never closed), tag names appearing
  // mid-sentence, partial fragments after a streaming reflow, etc.
  // None of these tag names are anything a real user would type into
  // a chat about dental appointments, so we bias toward over-stripping
  // and drop the whole line. Collapses the gap so the message doesn't
  // leave a visible vertical hole where the leak used to be.
  // Derived from the canonical ARTIFACT_TAG_NAMES above so the two lists
  // can't drift out of sync. Names contain only `[a-z_]`, so no regex
  // escaping is needed.
  const TAG_NAME_RE = new RegExp(`\\b(${ARTIFACT_TAG_NAMES.join('|')})\\b`, 'i');
  for (const segment of segments) {
    if (segment.type !== 'text') continue;
    if (!TAG_NAME_RE.test(segment.value)) continue;
    segment.value = segment.value
      .split('\n')
      .filter((line) => !TAG_NAME_RE.test(line))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '');
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