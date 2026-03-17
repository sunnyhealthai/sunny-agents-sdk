import { SunnyAgentsClient } from '../client/SunnyAgentsClient';
import type { PasswordlessAuthManager } from '../client/passwordlessAuth';
import type {
  AuthUpgradeProfileSyncData,
  DoctorProfileArtifact,
  ProviderResult,
  ProviderSearchResultsArtifact,
  SdkAuthType,
  SunnyAgentMessage,
  SunnyAgentMessageItem,
  SunnyAgentsClientSnapshot,
  SunnyAgentsConfig,
  VanillaChatDimensions,
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
  /** Background color for modal and content areas. Default: #fff */
  background?: string;
  /** Main text color. Default: #212124 */
  text?: string;
}

export type { VanillaChatDimensions };

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

/** Complete E.164 country calling codes for phone region dropdown. Sorted numerically, US first. */
const COUNTRY_CODES: { code: string; label: string }[] = [
  { code: '1', label: '+1 United States' },
  { code: '1', label: '+1 Canada' },
  { code: '1', label: '+1 Bahamas' },
  { code: '1', label: '+1 Barbados' },
  { code: '1', label: '+1 Anguilla' },
  { code: '1', label: '+1 Antigua and Barbuda' },
  { code: '1', label: '+1 British Virgin Islands' },
  { code: '1', label: '+1 Cayman Islands' },
  { code: '1', label: '+1 Bermuda' },
  { code: '1', label: '+1 Dominica' },
  { code: '1', label: '+1 Dominican Republic' },
  { code: '1', label: '+1 Grenada' },
  { code: '1', label: '+1 Jamaica' },
  { code: '1', label: '+1 Montserrat' },
  { code: '1', label: '+1 Northern Mariana Islands' },
  { code: '1', label: '+1 Puerto Rico' },
  { code: '1', label: '+1 Saint Kitts and Nevis' },
  { code: '1', label: '+1 Saint Lucia' },
  { code: '1', label: '+1 Saint Vincent and the Grenadines' },
  { code: '1', label: '+1 Sint Maarten' },
  { code: '1', label: '+1 Trinidad and Tobago' },
  { code: '1', label: '+1 Turks and Caicos Islands' },
  { code: '1', label: '+1 US Virgin Islands' },
  { code: '1', label: '+1 American Samoa' },
  { code: '1', label: '+1 Guam' },
  { code: '7', label: '+7 Russia' },
  { code: '7', label: '+7 Kazakhstan' },
  { code: '20', label: '+20 Egypt' },
  { code: '211', label: '+211 South Sudan' },
  { code: '212', label: '+212 Morocco' },
  { code: '212', label: '+212 Western Sahara' },
  { code: '213', label: '+213 Algeria' },
  { code: '216', label: '+216 Tunisia' },
  { code: '218', label: '+218 Libya' },
  { code: '220', label: '+220 Gambia' },
  { code: '221', label: '+221 Senegal' },
  { code: '222', label: '+222 Mauritania' },
  { code: '223', label: '+223 Mali' },
  { code: '224', label: '+224 Guinea' },
  { code: '225', label: '+225 Ivory Coast' },
  { code: '226', label: '+226 Burkina Faso' },
  { code: '227', label: '+227 Niger' },
  { code: '228', label: '+228 Togo' },
  { code: '229', label: '+229 Benin' },
  { code: '230', label: '+230 Mauritius' },
  { code: '231', label: '+231 Liberia' },
  { code: '232', label: '+232 Sierra Leone' },
  { code: '233', label: '+233 Ghana' },
  { code: '234', label: '+234 Nigeria' },
  { code: '235', label: '+235 Chad' },
  { code: '236', label: '+236 Central African Republic' },
  { code: '237', label: '+237 Cameroon' },
  { code: '238', label: '+238 Cape Verde' },
  { code: '239', label: '+239 São Tomé and Príncipe' },
  { code: '240', label: '+240 Equatorial Guinea' },
  { code: '241', label: '+241 Gabon' },
  { code: '242', label: '+242 Republic of the Congo' },
  { code: '243', label: '+243 Democratic Republic of the Congo' },
  { code: '244', label: '+244 Angola' },
  { code: '245', label: '+245 Guinea-Bissau' },
  { code: '246', label: '+246 British Indian Ocean Territory' },
  { code: '247', label: '+247 Ascension Island' },
  { code: '248', label: '+248 Seychelles' },
  { code: '249', label: '+249 Sudan' },
  { code: '250', label: '+250 Rwanda' },
  { code: '251', label: '+251 Ethiopia' },
  { code: '252', label: '+252 Somalia' },
  { code: '253', label: '+253 Djibouti' },
  { code: '254', label: '+254 Kenya' },
  { code: '255', label: '+255 Tanzania' },
  { code: '256', label: '+256 Uganda' },
  { code: '257', label: '+257 Burundi' },
  { code: '258', label: '+258 Mozambique' },
  { code: '260', label: '+260 Zambia' },
  { code: '261', label: '+261 Madagascar' },
  { code: '262', label: '+262 Réunion' },
  { code: '262', label: '+262 Mayotte' },
  { code: '263', label: '+263 Zimbabwe' },
  { code: '264', label: '+264 Namibia' },
  { code: '265', label: '+265 Malawi' },
  { code: '266', label: '+266 Lesotho' },
  { code: '267', label: '+267 Botswana' },
  { code: '268', label: '+268 Eswatini' },
  { code: '269', label: '+269 Comoros' },
  { code: '290', label: '+290 Saint Helena' },
  { code: '290', label: '+290 Tristan da Cunha' },
  { code: '291', label: '+291 Eritrea' },
  { code: '297', label: '+297 Aruba' },
  { code: '298', label: '+298 Faroe Islands' },
  { code: '299', label: '+299 Greenland' },
  { code: '30', label: '+30 Greece' },
  { code: '31', label: '+31 Netherlands' },
  { code: '32', label: '+32 Belgium' },
  { code: '33', label: '+33 France' },
  { code: '34', label: '+34 Spain' },
  { code: '36', label: '+36 Hungary' },
  { code: '39', label: '+39 Italy' },
  { code: '39', label: '+39 Vatican City' },
  { code: '350', label: '+350 Gibraltar' },
  { code: '351', label: '+351 Portugal' },
  { code: '352', label: '+352 Luxembourg' },
  { code: '353', label: '+353 Ireland' },
  { code: '354', label: '+354 Iceland' },
  { code: '355', label: '+355 Albania' },
  { code: '356', label: '+356 Malta' },
  { code: '357', label: '+357 Cyprus' },
  { code: '358', label: '+358 Finland' },
  { code: '358', label: '+358 Åland Islands' },
  { code: '359', label: '+359 Bulgaria' },
  { code: '370', label: '+370 Lithuania' },
  { code: '371', label: '+371 Latvia' },
  { code: '372', label: '+372 Estonia' },
  { code: '373', label: '+373 Moldova' },
  { code: '374', label: '+374 Armenia' },
  { code: '375', label: '+375 Belarus' },
  { code: '376', label: '+376 Andorra' },
  { code: '377', label: '+377 Monaco' },
  { code: '378', label: '+378 San Marino' },
  { code: '379', label: '+379 Vatican City' },
  { code: '380', label: '+380 Ukraine' },
  { code: '381', label: '+381 Serbia' },
  { code: '382', label: '+382 Montenegro' },
  { code: '383', label: '+383 Kosovo' },
  { code: '385', label: '+385 Croatia' },
  { code: '386', label: '+386 Slovenia' },
  { code: '387', label: '+387 Bosnia and Herzegovina' },
  { code: '389', label: '+389 North Macedonia' },
  { code: '40', label: '+40 Romania' },
  { code: '41', label: '+41 Switzerland' },
  { code: '43', label: '+43 Austria' },
  { code: '44', label: '+44 United Kingdom' },
  { code: '44', label: '+44 Guernsey' },
  { code: '44', label: '+44 Isle of Man' },
  { code: '44', label: '+44 Jersey' },
  { code: '45', label: '+45 Denmark' },
  { code: '46', label: '+46 Sweden' },
  { code: '47', label: '+47 Norway' },
  { code: '47', label: '+47 Svalbard and Jan Mayen' },
  { code: '48', label: '+48 Poland' },
  { code: '49', label: '+49 Germany' },
  { code: '420', label: '+420 Czech Republic' },
  { code: '421', label: '+421 Slovakia' },
  { code: '423', label: '+423 Liechtenstein' },
  { code: '500', label: '+500 Falkland Islands' },
  { code: '500', label: '+500 South Georgia and the South Sandwich Islands' },
  { code: '501', label: '+501 Belize' },
  { code: '502', label: '+502 Guatemala' },
  { code: '503', label: '+503 El Salvador' },
  { code: '504', label: '+504 Honduras' },
  { code: '505', label: '+505 Nicaragua' },
  { code: '506', label: '+506 Costa Rica' },
  { code: '507', label: '+507 Panama' },
  { code: '508', label: '+508 Saint Pierre and Miquelon' },
  { code: '509', label: '+509 Haiti' },
  { code: '51', label: '+51 Peru' },
  { code: '52', label: '+52 Mexico' },
  { code: '53', label: '+53 Cuba' },
  { code: '54', label: '+54 Argentina' },
  { code: '55', label: '+55 Brazil' },
  { code: '56', label: '+56 Chile' },
  { code: '57', label: '+57 Colombia' },
  { code: '58', label: '+58 Venezuela' },
  { code: '590', label: '+590 Guadeloupe' },
  { code: '590', label: '+590 Saint Barthélemy' },
  { code: '590', label: '+590 Saint Martin' },
  { code: '591', label: '+591 Bolivia' },
  { code: '592', label: '+592 Guyana' },
  { code: '593', label: '+593 Ecuador' },
  { code: '594', label: '+594 French Guiana' },
  { code: '595', label: '+595 Paraguay' },
  { code: '596', label: '+596 Martinique' },
  { code: '597', label: '+597 Suriname' },
  { code: '598', label: '+598 Uruguay' },
  { code: '599', label: '+599 Caribbean Netherlands' },
  { code: '599', label: '+599 Curaçao' },
  { code: '60', label: '+60 Malaysia' },
  { code: '61', label: '+61 Australia' },
  { code: '61', label: '+61 Christmas Island' },
  { code: '61', label: '+61 Cocos Islands' },
  { code: '62', label: '+62 Indonesia' },
  { code: '63', label: '+63 Philippines' },
  { code: '64', label: '+64 New Zealand' },
  { code: '64', label: '+64 Pitcairn Islands' },
  { code: '65', label: '+65 Singapore' },
  { code: '66', label: '+66 Thailand' },
  { code: '670', label: '+670 Timor-Leste' },
  { code: '672', label: '+672 Norfolk Island' },
  { code: '672', label: '+672 Australian Antarctic Territory' },
  { code: '673', label: '+673 Brunei' },
  { code: '674', label: '+674 Nauru' },
  { code: '675', label: '+675 Papua New Guinea' },
  { code: '676', label: '+676 Tonga' },
  { code: '677', label: '+677 Solomon Islands' },
  { code: '678', label: '+678 Vanuatu' },
  { code: '679', label: '+679 Fiji' },
  { code: '680', label: '+680 Palau' },
  { code: '681', label: '+681 Wallis and Futuna' },
  { code: '682', label: '+682 Cook Islands' },
  { code: '683', label: '+683 Niue' },
  { code: '685', label: '+685 Samoa' },
  { code: '686', label: '+686 Kiribati' },
  { code: '687', label: '+687 New Caledonia' },
  { code: '688', label: '+688 Tuvalu' },
  { code: '689', label: '+689 French Polynesia' },
  { code: '690', label: '+690 Tokelau' },
  { code: '691', label: '+691 Micronesia' },
  { code: '692', label: '+692 Marshall Islands' },
  { code: '81', label: '+81 Japan' },
  { code: '82', label: '+82 South Korea' },
  { code: '84', label: '+84 Vietnam' },
  { code: '850', label: '+850 North Korea' },
  { code: '852', label: '+852 Hong Kong' },
  { code: '853', label: '+853 Macau' },
  { code: '855', label: '+855 Cambodia' },
  { code: '856', label: '+856 Laos' },
  { code: '86', label: '+86 China' },
  { code: '90', label: '+90 Turkey' },
  { code: '90', label: '+90 Northern Cyprus' },
  { code: '91', label: '+91 India' },
  { code: '92', label: '+92 Pakistan' },
  { code: '93', label: '+93 Afghanistan' },
  { code: '94', label: '+94 Sri Lanka' },
  { code: '95', label: '+95 Myanmar' },
  { code: '880', label: '+880 Bangladesh' },
  { code: '960', label: '+960 Maldives' },
  { code: '961', label: '+961 Lebanon' },
  { code: '962', label: '+962 Jordan' },
  { code: '963', label: '+963 Syria' },
  { code: '964', label: '+964 Iraq' },
  { code: '965', label: '+965 Kuwait' },
  { code: '966', label: '+966 Saudi Arabia' },
  { code: '967', label: '+967 Yemen' },
  { code: '968', label: '+968 Oman' },
  { code: '886', label: '+886 Taiwan' },
  { code: '970', label: '+970 Palestine' },
  { code: '971', label: '+971 United Arab Emirates' },
  { code: '972', label: '+972 Israel' },
  { code: '973', label: '+973 Bahrain' },
  { code: '974', label: '+974 Qatar' },
  { code: '975', label: '+975 Bhutan' },
  { code: '976', label: '+976 Mongolia' },
  { code: '977', label: '+977 Nepal' },
  { code: '98', label: '+98 Iran' },
  { code: '992', label: '+992 Tajikistan' },
  { code: '993', label: '+993 Turkmenistan' },
  { code: '994', label: '+994 Azerbaijan' },
  { code: '995', label: '+995 Georgia' },
  { code: '996', label: '+996 Kyrgyzstan' },
  { code: '998', label: '+998 Uzbekistan' },
];

// Sort numerically by code, with United States first
COUNTRY_CODES.sort((a, b) => {
  const numA = parseInt(a.code, 10);
  const numB = parseInt(b.code, 10);
  if (numA !== numB) return numA - numB;
  if (a.label.includes('United States')) return -1;
  if (b.label.includes('United States')) return 1;
  return a.label.localeCompare(b.label);
});

type ArtifactSegment =
  | { type: 'text'; value: string }
  | { type: 'expanded_profile'; data: any }
  | { type: 'minimal_profile'; data: any }
  | { type: 'legacy_profile'; data: any }
  | { type: 'provider_search_results'; data: ProviderSearchResultsArtifact }
  | { type: 'verification_flow'; action: string };
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
    conversationId: providedConversationId,
    colors = {},
    fontSize,
    fontFamily,
    dimensions,
    passwordlessAuth,
  } = options;

  // Use provided conversation ID or generate a new one (in-memory only)
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
  root.className = 'sunny-chat sunny-chat--collapsed';

  // Apply custom theme properties
  if (colors.primary) root.style.setProperty('--sunny-color-primary', colors.primary);
  if (colors.secondary) root.style.setProperty('--sunny-color-secondary', colors.secondary);
  if (colors.accent) root.style.setProperty('--sunny-color-accent', colors.accent);
  if (colors.background) root.style.setProperty('--sunny-color-background', colors.background);
  if (colors.text) root.style.setProperty('--sunny-color-text', colors.text);
  if (fontSize) root.style.setProperty('--sunny-font-size-base', fontSize);
  if (fontFamily) root.style.setProperty('--sunny-font-family', fontFamily);
  if (dimensions?.width) root.style.setProperty('--sunny-modal-width', dimensions.width);
  if (dimensions?.height) root.style.setProperty('--sunny-modal-height', dimensions.height);
  if (dimensions?.triggerMaxWidth) root.style.setProperty('--sunny-trigger-max-width', dimensions.triggerMaxWidth);
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
      // Clear any keyboard-related inline styles
      modalBackdrop.style.alignItems = '';
      modal.style.height = '';
      modal.style.maxHeight = '';
      modal.style.marginTop = '';
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
    // Filter out hidden messages from display
    const visibleMessages = convo.messages.filter((msg) => !msg.text?.includes('{hidden_message}'));
    const approvalStatuses = buildApprovalStatuses(convo.messages);

    for (const msg of visibleMessages) {
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
      const paragraph = createParagraph(message.text || (message.isStreaming ? '…' : ''), false);
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
      const paragraph = createParagraph(baseText, true);
      if (paragraph) {
        container.appendChild(paragraph);
      }
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
        container.appendChild(createExpandedProviderCard(segment.data));
      } else if (segment.type === 'minimal_profile') {
        container.appendChild(createMinimalProviderCard(segment.data));
      } else if (segment.type === 'legacy_profile') {
        container.appendChild(createLegacyProviderCard(segment.data));
      } else if (segment.type === 'provider_search_results') {
        // Append each provider card individually
        const providerCards = createProviderSearchResultsCard(segment.data);
        providerCards.forEach((card) => {
          container.appendChild(card);
        });
      } else if (segment.type === 'verification_flow') {
        container.appendChild(createVerificationFlowComponent(passwordlessAuth, client, config));
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

  const createVerificationFlowComponent = (authManager: PasswordlessAuthManager | undefined, client: SunnyAgentsClient, clientConfig: SunnyAgentsConfig | undefined): HTMLElement => {
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

    // Check if user is already authenticated - if so, show success state immediately
    if (authManager.isAuthenticated()) {
      const successMessage = document.createElement('div');
      successMessage.className = 'sunny-verification-flow__success';
      successMessage.textContent = '✓ Verification successful! You are now authenticated.';
      card.appendChild(successMessage);
      return card;
    }

    // Form state
    let waitingForCode = false;
    let currentEmail: string | null = null;
    let currentPhone: string | null = null;
    let isSendingCode = false;
    let isVerifyingCode = false;

    // Create form container
    const form = document.createElement('form');
    form.className = 'sunny-verification-flow__form';
    form.addEventListener('submit', (e) => e.preventDefault());

    // Email/Phone input group
    const inputGroup = document.createElement('div');
    inputGroup.className = 'sunny-verification-flow__input-group';

    // Toggle between email and phone
    const methodToggle = document.createElement('div');
    methodToggle.className = 'sunny-verification-flow__method-toggle';
    const emailTab = document.createElement('button');
    emailTab.type = 'button';
    emailTab.className = 'sunny-verification-flow__tab sunny-verification-flow__tab--active';
    emailTab.textContent = 'Email';
    const phoneTab = document.createElement('button');
    phoneTab.type = 'button';
    phoneTab.className = 'sunny-verification-flow__tab';
    phoneTab.textContent = 'Phone';

    let useEmail = true;
    emailTab.addEventListener('click', () => {
      useEmail = true;
      emailTab.classList.add('sunny-verification-flow__tab--active');
      phoneTab.classList.remove('sunny-verification-flow__tab--active');
      emailInput.style.display = 'block';
      phoneRow.style.display = 'none';
    });
    phoneTab.addEventListener('click', () => {
      useEmail = false;
      phoneTab.classList.add('sunny-verification-flow__tab--active');
      emailTab.classList.remove('sunny-verification-flow__tab--active');
      emailInput.style.display = 'none';
      phoneRow.style.display = 'flex';
    });

    methodToggle.appendChild(emailTab);
    methodToggle.appendChild(phoneTab);

    // Email input
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.className = 'sunny-verification-flow__input';
    emailInput.placeholder = 'Enter your email';
    emailInput.disabled = waitingForCode || isSendingCode;

    // Phone row: region dropdown + phone input
    const phoneRow = document.createElement('div');
    phoneRow.className = 'sunny-verification-flow__phone-row';
    phoneRow.style.display = 'none';

    const phoneRegionSelect = document.createElement('select');
    phoneRegionSelect.className = 'sunny-verification-flow__phone-region';
    phoneRegionSelect.disabled = waitingForCode || isSendingCode;
    phoneRegionSelect.setAttribute('aria-label', 'Country or region');
    for (const { code, label } of COUNTRY_CODES) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = label;
      if (code === '1' && label.includes('United States')) {
        option.selected = true;
      }
      phoneRegionSelect.appendChild(option);
    }

    const phoneInput = document.createElement('input');
    phoneInput.type = 'tel';
    phoneInput.className = 'sunny-verification-flow__input';
    phoneInput.placeholder = 'Enter your phone number';
    phoneInput.disabled = waitingForCode || isSendingCode;

    phoneRow.appendChild(phoneRegionSelect);
    phoneRow.appendChild(phoneInput);

    inputGroup.appendChild(methodToggle);
    inputGroup.appendChild(emailInput);
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

    // Success message (hidden initially)
    const successMessage = document.createElement('div');
    successMessage.className = 'sunny-verification-flow__success';
    successMessage.style.display = 'none';
    successMessage.textContent = '✓ Verification successful! You are now authenticated.';

    const updateUI = () => {
      if (waitingForCode) {
        actionButton.textContent = 'Verify Code';
        codeGroup.style.display = 'block';
        emailInput.disabled = true;
        phoneInput.disabled = true;
        phoneRegionSelect.disabled = true;
      } else {
        actionButton.textContent = 'Send Code';
        codeGroup.style.display = 'none';
        emailInput.disabled = isSendingCode;
        phoneInput.disabled = isSendingCode;
        phoneRegionSelect.disabled = isSendingCode;
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

    const handleSubmit = async () => {
      if (isSendingCode || isVerifyingCode) return;

      hideStatus();

      if (!waitingForCode) {
        // Start login flow
        const email = emailInput.value.trim();
        const phoneDigits = phoneInput.value.replace(/\D/g, '');
        const selectedCode = phoneRegionSelect.value;
        const phone = phoneDigits ? `+${selectedCode}${phoneDigits}` : '';

        if (useEmail && !email) {
          showStatus('Please enter your email', 'error');
          return;
        }
        if (!useEmail && !phoneDigits) {
          showStatus('Please enter your phone number', 'error');
          return;
        }

        isSendingCode = true;
        updateUI();

        try {
          if (useEmail) {
            await authManager.startLogin({ email });
            currentEmail = email;
            currentPhone = null;
            showStatus(`Verification code sent to ${email}`, 'success');
          } else {
            await authManager.startLogin({ phoneNumber: phone });
            currentPhone = phone;
            currentEmail = null;
            showStatus(`Verification code sent to ${phone}`, 'success');
          }
          waitingForCode = true;
          isSendingCode = false;
          updateUI();
          clearCodeInputs();
          codeInputs[0].focus();
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
            email: currentEmail ?? undefined,
            phoneNumber: currentPhone ?? undefined,
            code,
          });

          const idToken = authManager.getIdToken();
          if (idToken && config?.tokenExchange) {
            // Update the client's token provider
            client.setIdTokenProvider(() => Promise.resolve(idToken));
          }

          // Show success
          successMessage.style.display = 'block';
          form.style.display = 'none';
          showStatus('', 'success');

          // Send hidden message to LLM indicating successful authentication
          // Wait a brief moment for migration events to be processed if migrateHistory is enabled
          try {
            // Small delay to allow migration events to be processed (they arrive before auth.upgraded)
            await new Promise(resolve => setTimeout(resolve, 100));

            const snap = client.getSnapshot();
            const conversationId = snap.activeConversationId ?? snap.conversations[0]?.id;
            if (conversationId) {
              await client.sendMessage('{hidden_message}"auth_success"{hidden_message/}', {
                conversationId,
              });
            }
          } catch (error) {
            // Silently fail - hidden message is not critical for UI
            console.warn('[VanillaChat] Failed to send auth success message:', error);
          }

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

    form.appendChild(inputGroup);
    form.appendChild(codeGroup);
    form.appendChild(statusMessage);
    form.appendChild(actionButton);

    card.appendChild(form);
    card.appendChild(successMessage);

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

  const send = async () => {
    const text = modalInput.value.trim();
    if (!text) return;
    setExpanded(true);
    try {
      const { conversationId } = await client.sendMessage(text, { conversationId: persistedConversationId });
      persistedConversationId = conversationId;
      modalInput.value = '';
      render();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      console.error('[VanillaChat] Error sending message:', errorMessage);
      // Restore the text to the input so user can retry
      modalInput.value = text;
      throw error; // Re-throw so handleModalSendClick can show alert
    }
  };

  // Modal send button
  const handleModalSendClick = () => {
    void send().catch((error) => {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      console.error('[VanillaChat] Error sending message:', errorMessage);
      alert(`Failed to connect: ${errorMessage}\n\nMake sure the WebSocket server is running at the configured URL.`);
    });
  };
  modalSendBtn.addEventListener('click', handleModalSendClick);

  // Send from trigger input (first message)
  const sendFromTrigger = async () => {
    const text = triggerInput.value.trim();
    if (!text) return;
    // Transfer text to modal and open it
    modalInput.value = text;
    triggerInput.value = '';
    setExpanded(true);
    try {
      const { conversationId } = await client.sendMessage(text, { conversationId: persistedConversationId });
      persistedConversationId = conversationId;
      modalInput.value = '';
      render();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      console.error('[VanillaChat] Error sending message:', errorMessage);
      // Restore the text to the input so user can retry
      modalInput.value = text;
      alert(`Failed to connect: ${errorMessage}\n\nMake sure the WebSocket server is running at the configured URL.`);
    }
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

  // Mobile virtual keyboard handling via Visual Viewport API.
  // iOS Safari only fires visualViewport resize AFTER the keyboard animation
  // completes (~300-500ms), causing visible lag. To get smooth, frame-accurate
  // resizing we poll visualViewport.height with rAF while an input has focus,
  // then stop polling once the viewport stabilises or the input blurs.
  let vkPollId = 0;
  let lastVVHeight = 0;
  let vkStableFrames = 0;

  const applyViewportSize = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    const h = Math.round(vv.height);
    if (h === lastVVHeight) return false; // no change
    lastVVHeight = h;
    modalBackdrop.style.alignItems = 'flex-start';
    modal.style.height = `${h}px`;
    modal.style.maxHeight = `${h}px`;
    if (vv.offsetTop > 0) {
      modal.style.marginTop = `${vv.offsetTop}px`;
    } else {
      modal.style.marginTop = '';
    }
    if (isExpanded) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
    return true; // changed
  };

  const pollViewport = () => {
    const changed = applyViewportSize();
    // Stop polling after 20 consecutive unchanged frames (~330ms of stability)
    vkStableFrames = changed ? 0 : vkStableFrames + 1;
    if (vkStableFrames < 20) {
      vkPollId = requestAnimationFrame(pollViewport);
    } else {
      vkPollId = 0;
    }
  };

  const startVKPolling = () => {
    vkStableFrames = 0;
    if (!vkPollId) {
      vkPollId = requestAnimationFrame(pollViewport);
    }
  };

  const stopVKPolling = () => {
    if (vkPollId) {
      cancelAnimationFrame(vkPollId);
      vkPollId = 0;
    }
  };

  // Start polling whenever an input inside the modal receives focus
  const handleModalFocusIn = () => { if (window.visualViewport) startVKPolling(); };
  const handleModalFocusOut = () => {
    // Brief delay — focus may move between inputs within the modal
    setTimeout(() => {
      if (!modal.contains(document.activeElement)) {
        stopVKPolling();
        // Reset styles when keyboard fully closes
        applyViewportSize();
      }
    }, 100);
  };
  modal.addEventListener('focusin', handleModalFocusIn);
  modal.addEventListener('focusout', handleModalFocusOut);

  // Also listen to visualViewport resize as a fallback for non-focus-driven changes
  const handleViewportResize = () => { startVKPolling(); };
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportResize);
    window.visualViewport.addEventListener('scroll', handleViewportResize);
  }

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
    // Clean up document event listeners
    document.removeEventListener('keydown', handleEscapeKey);
    // Clean up virtual keyboard handling
    stopVKPolling();
    modal.removeEventListener('focusin', handleModalFocusIn);
    modal.removeEventListener('focusout', handleModalFocusOut);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', handleViewportResize);
      window.visualViewport.removeEventListener('scroll', handleViewportResize);
    }
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
    --sunny-color-background: #ffffff;
    --sunny-color-text: #212124;
    --sunny-color-danger: #ef4444;
    --sunny-color-danger-hover: #dc2626;
    
    /* Typography - can be overridden via options */
    --sunny-font-size-base: 14px;
    --sunny-font-family: 'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    
    /* Dimensions - can be overridden via options */
    --sunny-modal-width: 1390px;
    --sunny-modal-height: 980px;
    --sunny-trigger-max-width: 600px;
    
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
    background: var(--sunny-color-background);
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
    padding: 16px 20px 20px;
    background: var(--sunny-color-background);
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
    margin: 12px 0;
    border: 1px solid var(--sunny-color-primary-border);
    border-radius: 12px;
    padding: 16px;
    background: linear-gradient(to bottom right, var(--sunny-color-primary-card-bg), var(--sunny-color-primary-card-bg-alt));
    box-shadow: var(--sunny-shadow-sm);
    transition: box-shadow var(--sunny-transition-normal), border-color var(--sunny-transition-normal);
  }
  .sunny-provider-card:hover {
    box-shadow: var(--sunny-shadow-md);
    border-color: var(--sunny-color-primary-border-hover);
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
    transition: border-color var(--sunny-transition-fast), box-shadow var(--sunny-transition-fast);
  }
  .sunny-provider-search-results__provider:hover {
    border-color: var(--sunny-color-primary-border-hover);
    box-shadow: var(--sunny-shadow-md);
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
  .sunny-verification-flow__method-toggle {
    display: flex;
    gap: 8px;
    margin-bottom: 4px;
  }
  .sunny-verification-flow__tab {
    flex: 1;
    padding: 8px 16px;
    border: 1px solid var(--sunny-gray-300);
    background: var(--sunny-color-background);
    color: var(--sunny-gray-600);
    border-radius: 8px 8px 0 0;
    font-size: 1em;
    font-weight: 500;
    cursor: pointer;
    transition: background var(--sunny-transition-fast), border-color var(--sunny-transition-fast), color var(--sunny-transition-fast);
    font-family: inherit;
  }
  .sunny-verification-flow__tab:hover {
    background: var(--sunny-gray-100);
    border-color: var(--sunny-gray-400);
  }
  .sunny-verification-flow__tab--active {
    background: var(--sunny-color-primary);
    color: #fff;
    border-color: var(--sunny-color-primary);
  }
  .sunny-verification-flow__tab--active:hover {
    background: var(--sunny-color-primary-hover);
    border-color: var(--sunny-color-primary-hover);
  }
  .sunny-verification-flow__input-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sunny-verification-flow__phone-row {
    display: flex;
    gap: 8px;
  }
  .sunny-verification-flow__phone-region {
    min-width: 140px;
    padding: 12px 16px;
    border: 1px solid var(--sunny-gray-300);
    border-radius: 8px;
    font-size: 1.071em;
    font-family: inherit;
    background: var(--sunny-color-background);
    color: var(--sunny-color-text);
    transition: border-color var(--sunny-transition-fast), box-shadow var(--sunny-transition-fast);
    outline: none;
    cursor: pointer;
  }
  .sunny-verification-flow__phone-region:focus {
    border-color: var(--sunny-color-primary);
    box-shadow: 0 0 0 3px var(--sunny-color-primary-ring);
  }
  .sunny-verification-flow__phone-region:disabled {
    background: var(--sunny-gray-100);
    color: var(--sunny-gray-500);
    cursor: not-allowed;
  }
  .sunny-verification-flow__phone-row .sunny-verification-flow__input {
    flex: 1;
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
    .sunny-verification-flow__code-input {
      width: 36px;
      height: 44px;
      font-size: 18px;
      border-radius: 6px;
    }
    .sunny-verification-flow__code-inputs {
      gap: 6px;
    }
    .sunny-verification-flow__phone-region {
      min-width: 0;
      width: 90px;
      padding: 10px 8px;
      font-size: 0.9em;
    }
    .sunny-verification-flow__phone-row {
      gap: 6px;
    }
    .sunny-verification-flow__input {
      padding: 10px 12px;
      font-size: 1em;
    }
    .sunny-verification-flow {
      padding: 14px;
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

function splitArtifactSegments(text: string): ArtifactSegment[] {
  if (!text) return [];
  const segments: ArtifactSegment[] = [];
  let cursor = 0;

  // Find all tag positions
  type TagMatch = { type: 'expanded' | 'minimal' | 'legacy' | 'provider_search_results' | 'verification_flow'; start: number; end: number; data?: any; action?: string };
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
        // Check if it's a provider search results artifact
        else if (artifact && typeof artifact === 'object' && artifact.item_type === 'provider_search_results' && artifact.item_content) {
          // Extract item_content and create a provider search results segment
          tagMatches.push({ type: 'provider_search_results', start, end, data: artifact.item_content });
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
    // Extract content between tags (should be a quoted string like "init")
    const content = text.slice(contentStart, end).trim();
    // Remove quotes if present
    const action = content.replace(/^["']|["']$/g, '') || 'init';
    tagMatches.push({ type: 'verification_flow', start, end: end + VERIFICATION_FLOW_END.length, action });
    verificationCursor = end + VERIFICATION_FLOW_END.length;
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
    } else if (match.type === 'verification_flow') {
      segments.push({ type: 'verification_flow', action: match.action || 'init' });
    }

    cursor = match.end;
  }

  // Add remaining text
  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
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