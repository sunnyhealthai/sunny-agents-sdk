import { createSunnyChat, type SdkAuthType } from '@sunnyhealthai/agents-sdk';
import './style.css';

const chatContainer = document.getElementById('sunny-chat');
if (!chatContainer) {
  throw new Error('Missing #sunny-chat container');
}

// --- Configuration from environment variables ---
const partnerIdentifier = (import.meta.env.VITE_SUNNY_PARTNER_NAME as string | undefined) ?? 'guardian-mock';
const publicKey = (import.meta.env.VITE_SUNNY_PUBLIC_KEY as string | undefined) ?? '';
const authType = ((import.meta.env.VITE_SUNNY_AUTH_TYPE as string | undefined) ?? 'passwordless') as SdkAuthType;
const websocketUrl = (import.meta.env.VITE_SUNNY_WS_URL as string | undefined) ?? 'wss://llm.sunnyhealth.live';
const devRoute = import.meta.env.VITE_SUNNY_DEV_ROUTE as string | undefined;

console.log('[VanillaChat] Config:', { partnerIdentifier, publicKey: publicKey ? `${publicKey.substring(0, 20)}...` : '(not set)', authType, websocketUrl, devRoute: devRoute ?? '(not set)' });

// In-memory token storage for token exchange flow
let inMemoryIdToken: string | null = null;
const envIdToken = import.meta.env.VITE_SUNNY_ID_TOKEN as string | undefined;

const getIdTokenProvider = () => {
  if (envIdToken) return async () => envIdToken;
  if (inMemoryIdToken) return async () => inMemoryIdToken;
  return async () => null;
};

let chat: Awaited<ReturnType<typeof createSunnyChat>>;

async function initializeChat() {
  if (chat) {
    chat.destroy();
  }

  if (!publicKey) {
    console.warn('[VanillaChat] VITE_SUNNY_PUBLIC_KEY not set. Set it in your .env file.');
  }

  chat = await createSunnyChat({
    container: chatContainer!,
    partnerIdentifier,
    publicKey,
    authType,
    websocketUrl,
    devRoute,
    headerTitle: 'Sunny Chat',
    placeholder: 'Ask about your benefits…',
    colors: {
      primary: '#048db4',
      secondary: '#0c3c5c',
      accent: '#168c55',
    },
    ...(authType === 'tokenExchange' ? { idTokenProvider: getIdTokenProvider() } : {}),
  });
}

// Initial chat setup
initializeChat();

// Tab switching
const authTabs = document.querySelectorAll('.auth-tab');
const authContents = document.querySelectorAll('.auth-content');

authTabs.forEach((tab) => {
  tab.addEventListener('click', async () => {
    const targetTab = tab.getAttribute('data-tab');
    authTabs.forEach((t) => t.classList.remove('active'));
    authContents.forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    const targetContent = document.getElementById(`${targetTab}-auth`);
    if (targetContent) {
      targetContent.classList.add('active');
    }

    // Switch SDK auth type based on the selected tab
    if (chat?.setAuthType) {
      try {
        if (targetTab === 'manual') {
          await chat.setAuthType('tokenExchange', {
            idTokenProvider: getIdTokenProvider(),
          });
          console.log('[VanillaChat] Switched to tokenExchange auth');
        } else if (targetTab === 'passwordless') {
          await chat.setAuthType('passwordless');
          console.log('[VanillaChat] Switched to passwordless auth');
        }
      } catch (err) {
        console.warn('[VanillaChat] Failed to switch auth type:', err);
      }
    }
  });
});

// Passwordless auth form handling
const passwordlessForm = document.getElementById('passwordless-form') as HTMLFormElement | null;
const emailInput = document.getElementById('email-input') as HTMLInputElement | null;
const phoneInput = document.getElementById('phone-input') as HTMLInputElement | null;
const codeInput = document.getElementById('code-input') as HTMLInputElement | null;
const codeGroup = document.getElementById('code-group') as HTMLElement | null;
const passwordlessSubmit = document.getElementById('passwordless-submit') as HTMLButtonElement | null;
const passwordlessLogout = document.getElementById('passwordless-logout') as HTMLButtonElement | null;
const passwordlessStatus = document.getElementById('passwordless-status') as HTMLElement | null;

let waitingForCode = false;
let currentEmail: string | null = null;
let currentPhone: string | null = null;

const showStatus = (message: string, type: 'success' | 'error' | 'info') => {
  if (!passwordlessStatus) return;
  passwordlessStatus.textContent = message;
  passwordlessStatus.className = `status-message ${type}`;
};

const hideStatus = () => {
  if (!passwordlessStatus) return;
  passwordlessStatus.className = 'status-message';
};

const tokenDisplay = document.getElementById('token-display') as HTMLTextAreaElement | null;
const tokenDisplayGroup = document.getElementById('token-display-group') as HTMLElement | null;

const updateAuthUI = () => {
  if (passwordlessSubmit) {
    passwordlessSubmit.textContent = waitingForCode ? 'Verify Code' : 'Send Code';
  }
  if (codeGroup) {
    codeGroup.style.display = waitingForCode ? 'block' : 'none';
  }
  if (emailInput) {
    emailInput.disabled = waitingForCode;
  }
  if (phoneInput) {
    phoneInput.disabled = waitingForCode;
  }
};

passwordlessForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopPropagation();
  hideStatus();

  // Switch to passwordless auth type if not already
  if (chat?.setAuthType && authType !== 'passwordless') {
    try {
      await chat.setAuthType('passwordless');
    } catch (err) {
      console.warn('[VanillaChat] Failed to switch to passwordless:', err);
    }
  }

  if (!waitingForCode) {
    const email = emailInput?.value.trim();
    const phone = phoneInput?.value.trim();

    if (!email && !phone) {
      showStatus('Please enter either an email or phone number', 'error');
      return;
    }
    if (email && phone) {
      showStatus('Please enter either email or phone, not both', 'error');
      return;
    }

    showStatus('Sending verification code...', 'info');
    currentEmail = email || null;
    currentPhone = phone || null;
    waitingForCode = true;
    updateAuthUI();
    if (codeInput) codeInput.focus();
  } else {
    const code = codeInput?.value.trim();
    if (!code) {
      showStatus('Please enter the verification code', 'error');
      return;
    }
    showStatus('Verifying code...', 'info');

    // Code verification is handled by the passwordless auth manager inside the SDK
    // For now just reset the UI
    waitingForCode = false;
    updateAuthUI();
    if (emailInput) emailInput.value = '';
    if (phoneInput) phoneInput.value = '';
    if (codeInput) codeInput.value = '';
  }
});

passwordlessLogout?.addEventListener('click', async () => {
  waitingForCode = false;
  currentEmail = null;
  currentPhone = null;
  updateAuthUI();
  hideStatus();
  await initializeChat();
});

// Auth type switching buttons (if they exist in the HTML)
document.querySelectorAll('[data-auth-type]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const newAuthType = btn.getAttribute('data-auth-type') as SdkAuthType;
    if (chat?.setAuthType) {
      try {
        await chat.setAuthType(newAuthType);
        showStatus(`Switched to ${newAuthType} auth`, 'success');
      } catch (err) {
        showStatus(`Failed to switch auth: ${err instanceof Error ? err.message : String(err)}`, 'error');
      }
    }
  });
});

// Manual token form (for token exchange testing)
const tokenForm = document.getElementById('token-form') as HTMLFormElement | null;
const tokenInput = document.getElementById('token-input') as HTMLInputElement | null;
const clearTokenBtn = document.getElementById('clear-token') as HTMLButtonElement | null;

if (tokenInput) {
  tokenInput.value = inMemoryIdToken ?? '';
  tokenInput.placeholder = 'ID Token (for token exchange)';
}

tokenForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!tokenInput) return;
  const nextToken = tokenInput.value.trim();
  if (!nextToken) return;
  inMemoryIdToken = nextToken;
  console.log('[VanillaChat] ID token saved to memory');

  // Switch to tokenExchange auth type with the new token
  if (chat?.setAuthType) {
    try {
      await chat.setAuthType('tokenExchange', {
        idTokenProvider: async () => inMemoryIdToken,
      });
      showStatus('Token exchange configured', 'success');
    } catch (err) {
      showStatus(`Token exchange failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }
});

clearTokenBtn?.addEventListener('click', async () => {
  inMemoryIdToken = null;
  if (tokenInput) tokenInput.value = '';

  // Switch back to passwordless
  if (chat?.setAuthType) {
    try {
      await chat.setAuthType('passwordless');
    } catch (err) {
      console.warn('[VanillaChat] Failed to switch to passwordless:', err);
    }
  }
  console.log('[VanillaChat] Token cleared, switched to passwordless');
});

window.addEventListener('beforeunload', () => {
  chat?.destroy();
});
