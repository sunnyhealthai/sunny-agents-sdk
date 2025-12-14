import { attachSunnyChat } from '@sunnyhealth/sunny-agents-sdk';
import './style.css';

const chatContainer = document.getElementById('sunny-chat');
if (!chatContainer) {
  throw new Error('Missing #sunny-chat container');
}

const loadStoredToken = (): string | null => {
  const token = window.localStorage.getItem('sunny_access_token');
  return token && token.trim().length > 0 ? token.trim() : null;
};

const envToken = import.meta.env.VITE_SUNNY_ACCESS_TOKEN as string | undefined;
const storedToken = loadStoredToken();
const tokenProvider = envToken
  ? async () => envToken
  : storedToken
    ? async () => storedToken
    : undefined;

const hasServerToken = typeof tokenProvider === 'function';

const chat = attachSunnyChat({
  container: chatContainer,
  anonymous: !hasServerToken,
  headerTitle: 'Sunny Agents Demo',
  placeholder: 'Ask Sunny anything…',
  config: {
    websocketUrl: (import.meta.env.VITE_SUNNY_WS_URL as string | undefined) ?? 'wss://chat.api.sunnyhealthai.com',
    authorizeUrl:
      (import.meta.env.VITE_SUNNY_AUTHORIZE_URL as string | undefined) ?? 'https://chat.api.sunnyhealthai.com/authorize',
    ...(tokenProvider ? { tokenProvider } : {}),
  },
});

const tokenForm = document.getElementById('token-form') as HTMLFormElement | null;
const tokenInput = document.getElementById('token-input') as HTMLInputElement | null;
const clearTokenBtn = document.getElementById('clear-token') as HTMLButtonElement | null;

if (tokenInput) {
  tokenInput.value = storedToken ?? '';
}

tokenForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!tokenInput) return;
  const nextToken = tokenInput.value.trim();
  if (!nextToken) return;
  window.localStorage.setItem('sunny_access_token', nextToken);
  window.alert('Token saved. Reload the page to start authenticated sessions.');
});

clearTokenBtn?.addEventListener('click', () => {
  window.localStorage.removeItem('sunny_access_token');
  if (tokenInput) {
    tokenInput.value = '';
  }
  window.alert('Token cleared. Reload the page to use anonymous mode.');
});

window.addEventListener('beforeunload', () => {
  chat.destroy();
});
