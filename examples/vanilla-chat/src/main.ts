import { attachSunnyChat } from '@sunnyhealthai/agents-sdk';
import './style.css';

const chatContainer = document.getElementById('sunny-chat');
if (!chatContainer) {
  throw new Error('Missing #sunny-chat container');
}

const loadStoredIdToken = (): string | null => {
  const token = window.localStorage.getItem('sunny_id_token');
  return token && token.trim().length > 0 ? token.trim() : null;
};

const envIdToken = import.meta.env.VITE_SUNNY_ID_TOKEN as string | undefined;
const storedIdToken = loadStoredIdToken();
const idTokenProvider = envIdToken
  ? async () => envIdToken
  : storedIdToken
    ? async () => storedIdToken
    : undefined;

const hasIdToken = typeof idTokenProvider === 'function';

// Token exchange configuration
const tokenExchangeConfig = hasIdToken
  ? {
      partnerName: (import.meta.env.VITE_SUNNY_PARTNER_NAME as string | undefined) ?? 'sunny-health-external-mock',
      audience: (import.meta.env.VITE_SUNNY_AUDIENCE as string | undefined) ?? 'https://api.sunnyhealthai-staging.com',
      clientId: (import.meta.env.VITE_SUNNY_CLIENT_ID as string | undefined) ?? 'mEhHxDVWLUFE11hyEkDokLH788blHpgr',
      tokenExchangeUrl: import.meta.env.VITE_SUNNY_TOKEN_EXCHANGE_URL as string | undefined,
    }
  : undefined;

const chat = attachSunnyChat({
  container: chatContainer,
  anonymous: !hasIdToken,
  headerTitle: 'Sunny Chat',
  placeholder: 'Ask about your benefits…',
  colors: {
    primary: '#048db4',   // Spinnaker Blue
    secondary: '#0c3c5c', // Neptune's Wrath
    accent: '#168c55',    // Vital Green
  },
  config: {
    websocketUrl: (import.meta.env.VITE_SUNNY_WS_URL as string | undefined) ?? 'wss://chat.api.sunnyhealthai-staging.com',
    authorizeUrl:
      (import.meta.env.VITE_SUNNY_AUTHORIZE_URL as string | undefined) ?? 'https://chat.api.sunnyhealthai-staging.com/authorize',
    ...(idTokenProvider ? { idTokenProvider } : {}),
    ...(tokenExchangeConfig ? { tokenExchange: tokenExchangeConfig } : {}),
  },
});

const tokenForm = document.getElementById('token-form') as HTMLFormElement | null;
const tokenInput = document.getElementById('token-input') as HTMLInputElement | null;
const clearTokenBtn = document.getElementById('clear-token') as HTMLButtonElement | null;

if (tokenInput) {
  tokenInput.value = storedIdToken ?? '';
  tokenInput.placeholder = 'ID Token (for token exchange)';
}

tokenForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!tokenInput) return;
  const nextToken = tokenInput.value.trim();
  if (!nextToken) return;
  window.localStorage.setItem('sunny_id_token', nextToken);
  window.alert('ID Token saved. Reload the page to start authenticated sessions.');
});

clearTokenBtn?.addEventListener('click', () => {
  window.localStorage.removeItem('sunny_id_token');
  if (tokenInput) {
    tokenInput.value = '';
  }
  window.alert('ID Token cleared. Reload the page to use anonymous mode.');
});

window.addEventListener('beforeunload', () => {
  chat.destroy();
});
