import { attachSunnyChat, PasswordlessAuthManager, LLMWebSocketManager } from '@sunnyhealthai/agents-sdk';
import './style.css';

const chatContainer = document.getElementById('sunny-chat');
if (!chatContainer) {
  throw new Error('Missing #sunny-chat container');
}

// Token exchange configuration (only create if clientId and organization are provided)
const clientId = import.meta.env.VITE_SUNNY_CLIENT_ID as string | undefined;
const organization = import.meta.env.VITE_SUNNY_ORGANIZATION as string | undefined;
const tokenExchangeConfig = clientId && organization ? {
  partnerName: (import.meta.env.VITE_SUNNY_PARTNER_NAME as string | undefined) ?? 'guardian-mock',
  audience: (import.meta.env.VITE_SUNNY_AUDIENCE as string | undefined) ?? 'https://api.sunnyhealthai-staging.com',
  clientId,
  organization,
  tokenExchangeUrl: import.meta.env.VITE_SUNNY_TOKEN_EXCHANGE_URL as string | undefined,
  devRoute: import.meta.env.VITE_SUNNY_DEV_ROUTE as string | undefined,
} : undefined;

const websocketUrl = (import.meta.env.VITE_SUNNY_WS_URL as string | undefined) ?? 'wss://llm.sunnyhealth.live';
console.log('[VanillaChat] WebSocket URL from env:', import.meta.env.VITE_SUNNY_WS_URL);
console.log('[VanillaChat] Using WebSocket URL:', websocketUrl);

// Create shared WebSocket manager for passwordless auth and chat
const wsManager = new LLMWebSocketManager({
  websocketUrl,
  ...(tokenExchangeConfig ? { tokenExchange: tokenExchangeConfig, partnerName: tokenExchangeConfig.partnerName } : {}),
});

// Initialize passwordless auth manager (using WebSocket backend)
const passwordlessAuth = new PasswordlessAuthManager({
  wsManager,
  ...(tokenExchangeConfig ? { tokenExchange: tokenExchangeConfig } : {}),
  storageType: 'memory', // Use memory storage to prevent auth context from persisting across refreshes
  migrateHistory: true, // Migrate anonymous chat history to authenticated user
});

// In-memory token storage (no persistence)
let inMemoryIdToken: string | null = null;

const envIdToken = import.meta.env.VITE_SUNNY_ID_TOKEN as string | undefined;
const passwordlessUserId = passwordlessAuth.getUserId();

// Debug logging for token availability
console.log('[VanillaChat] Token availability check', {
  hasEnvToken: !!envIdToken,
  envTokenLength: envIdToken?.length || 0,
  hasInMemoryToken: !!inMemoryIdToken,
  inMemoryTokenLength: (inMemoryIdToken ?? '').length,
  hasPasswordlessUserId: !!passwordlessUserId,
  passwordlessUserId: passwordlessUserId || null,
  tokenExchangeConfig: tokenExchangeConfig,
});

// For token exchange, prioritize actual JWT tokens over passwordless user IDs
// Token exchange requires a JWT ID token, not a user ID string
// Prefer: env JWT token > in-memory JWT token > passwordless user ID (fallback)
const idTokenProvider = envIdToken
  ? async () => {
    console.log('[VanillaChat] Using JWT token from env for token exchange');
    return envIdToken;
  }
  : inMemoryIdToken
    ? async () => {
      console.log('[VanillaChat] Using JWT token from memory for token exchange');
      return inMemoryIdToken;
    }
    : passwordlessUserId
      ? async () => {
        console.warn('[VanillaChat] Using passwordless user ID as ID token (may not work for token exchange)', {
          userId: passwordlessUserId,
          note: 'Token exchange requires a JWT ID token, not a user ID',
        });
        return passwordlessUserId;
      }
      : undefined;

console.log('[VanillaChat] ID token provider setup', {
  hasEnvToken: !!envIdToken,
  hasInMemoryToken: !!inMemoryIdToken,
  hasPasswordlessUserId: !!passwordlessUserId,
  willUseTokenExchange: !!idTokenProvider && !!tokenExchangeConfig,
});

const hasIdToken = typeof idTokenProvider === 'function';

let chat = attachSunnyChat({
  container: chatContainer,
  anonymous: !hasIdToken,
  headerTitle: 'Sunny Chat',
  placeholder: 'Ask about your benefits…',
  colors: {
    primary: '#048db4',   // Spinnaker Blue
    secondary: '#0c3c5c', // Neptune's Wrath
    accent: '#168c55',    // Vital Green
  },
  passwordlessAuth,
  config: {
    websocketUrl,
    wsManager, // Share the same WebSocket manager with passwordless auth
    ...(idTokenProvider ? { idTokenProvider } : {}),
    ...(tokenExchangeConfig ? { tokenExchange: tokenExchangeConfig } : {}),
  },
});

// Tab switching
const authTabs = document.querySelectorAll('.auth-tab');
const authContents = document.querySelectorAll('.auth-content');

authTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const targetTab = tab.getAttribute('data-tab');
    authTabs.forEach((t) => t.classList.remove('active'));
    authContents.forEach((c) => c.classList.remove('active'));
    tab.classList.add('active');
    const targetContent = document.getElementById(`${targetTab}-auth`);
    if (targetContent) {
      targetContent.classList.add('active');
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
  const isAuthenticated = passwordlessAuth.isAuthenticated();
  if (passwordlessLogout) {
    passwordlessLogout.style.display = isAuthenticated ? 'block' : 'none';
  }
  if (passwordlessSubmit) {
    passwordlessSubmit.textContent = waitingForCode ? 'Verify Code' : 'Send Code';
  }
  if (codeGroup) {
    codeGroup.style.display = waitingForCode ? 'block' : 'none';
  }
  if (emailInput) {
    emailInput.disabled = isAuthenticated || waitingForCode;
  }
  if (phoneInput) {
    phoneInput.disabled = isAuthenticated || waitingForCode;
  }
  if (codeInput) {
    codeInput.disabled = isAuthenticated;
  }
  // Show/hide token display based on authentication state
  if (tokenDisplayGroup) {
    if (isAuthenticated && tokenDisplay && passwordlessAuth.getUserId()) {
      // Display user ID instead of token (WebSocket auth doesn't store tokens locally)
      tokenDisplay.value = `User ID: ${passwordlessAuth.getUserId()}\nEmail: ${passwordlessAuth.getEmail() || 'N/A'}`;
      tokenDisplayGroup.style.display = 'block';
    } else {
      tokenDisplayGroup.style.display = 'none';
      if (tokenDisplay) {
        tokenDisplay.value = '';
      }
    }
  }
};

passwordlessForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  event.stopPropagation();
  hideStatus();

  if (!waitingForCode) {
    // Start passwordless login
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

    try {
      if (email) {
        await passwordlessAuth.startLogin({ email });
        currentEmail = email;
        currentPhone = null;
      } else if (phone) {
        await passwordlessAuth.startLogin({ phoneNumber: phone });
        currentPhone = phone;
        currentEmail = null;
      }
      // Note: The code input will be shown automatically when passwordless.otp_sent is received
      // via the onOtpSent callback below
    } catch (error) {
      showStatus(`Failed to send code: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  } else {
    // Verify code
    const code = codeInput?.value.trim();
    if (!code) {
      showStatus('Please enter the verification code', 'error');
      return;
    }

    try {
      await passwordlessAuth.verifyCode({
        email: currentEmail ?? undefined,
        phoneNumber: currentPhone ?? undefined,
        code,
      });

      const userId = passwordlessAuth.getUserId();
      const email = passwordlessAuth.getEmail();
      console.log('Authentication successful, User ID:', userId, 'Email:', email);

      showStatus('Successfully authenticated!', 'success');
      waitingForCode = false;

      // Force update UI and ensure token is displayed
      updateAuthUI();

      // Double-check token display is shown after a brief delay
      setTimeout(() => {
        const userId = passwordlessAuth.getUserId();
        if (userId && tokenDisplay && tokenDisplayGroup) {
          tokenDisplay.value = `User ID: ${userId}\nEmail: ${passwordlessAuth.getEmail() || 'N/A'}`;
          tokenDisplayGroup.style.display = 'block';
          console.log('User info displayed in box');
        }
      }, 100);

      // Reinitialize chat with new token provider
      // Note: With WebSocket auth, the backend handles authentication automatically
      // We just need to ensure the WebSocket connection is authenticated
      chat.destroy();
      chat = attachSunnyChat({
        container: chatContainer!,
        anonymous: false,
        headerTitle: 'Sunny Chat',
        placeholder: 'Ask about your benefits…',
        colors: {
          primary: '#048db4',
          secondary: '#0c3c5c',
          accent: '#168c55',
        },
        passwordlessAuth,
        config: {
          websocketUrl: (import.meta.env.VITE_SUNNY_WS_URL as string | undefined) ?? 'wss://llm.sunnyhealth.live',
          wsManager, // Share the same WebSocket manager
          // For token exchange, prefer JWT tokens over passwordless user ID
          idTokenProvider: envIdToken
            ? async () => {
              console.log('[VanillaChat] Using JWT token from env for token exchange');
              return envIdToken;
            }
            : inMemoryIdToken
              ? async () => {
                console.log('[VanillaChat] Using JWT token from memory for token exchange');
                return inMemoryIdToken;
              }
              : () => {
                console.warn('[VanillaChat] Using passwordless user ID as ID token (may not work for token exchange)');
                return Promise.resolve(passwordlessAuth.getUserId());
              },
          ...(tokenExchangeConfig ? { tokenExchange: tokenExchangeConfig } : {}),
        },
      });

      // Clear form
      if (emailInput) emailInput.value = '';
      if (phoneInput) phoneInput.value = '';
      if (codeInput) codeInput.value = '';
    } catch (error) {
      showStatus(`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }
});

passwordlessLogout?.addEventListener('click', () => {
  passwordlessAuth.logout();
  waitingForCode = false;
  currentEmail = null;
  currentPhone = null;
  updateAuthUI(); // This will hide the token display box
  hideStatus();

  // Reinitialize chat in anonymous mode
  chat.destroy();
  chat = attachSunnyChat({
    container: chatContainer!,
    anonymous: true,
    headerTitle: 'Sunny Chat',
    placeholder: 'Ask about your benefits…',
    colors: {
      primary: '#048db4',
      secondary: '#0c3c5c',
      accent: '#168c55',
    },
    passwordlessAuth,
    config: {
      websocketUrl: (import.meta.env.VITE_SUNNY_WS_URL as string | undefined) ?? 'wss://llm.sunnyhealth.live',
      wsManager, // Share the same WebSocket manager
    },
  });
});

// Listen for auth state changes
passwordlessAuth.onAuthStateChange((isAuthenticated) => {
  updateAuthUI();
});

// Listen for OTP sent events - automatically show code input when OTP is sent
passwordlessAuth.onOtpSent((connection) => {
  const contactInfo = connection === 'email' ? currentEmail : currentPhone;
  if (contactInfo) {
    showStatus(`Verification code sent to ${contactInfo}`, 'success');
  } else {
    showStatus(`Verification code sent via ${connection}`, 'success');
  }
  waitingForCode = true;
  updateAuthUI();
  if (codeInput) {
    codeInput.focus();
  }
});

// Initialize UI state - check if we have stored auth state on page load
// Ensure token display is shown if auth state exists in storage
const initializeTokenDisplay = () => {
  const userId = passwordlessAuth.getUserId();
  if (userId && tokenDisplay && tokenDisplayGroup) {
    tokenDisplay.value = `User ID: ${userId}\nEmail: ${passwordlessAuth.getEmail() || 'N/A'}`;
    tokenDisplayGroup.style.display = 'block';
    console.log('Auth state restored from storage and displayed');
  }
  updateAuthUI();
};

// Run after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeTokenDisplay);
} else {
  // DOM already loaded
  setTimeout(initializeTokenDisplay, 0);
}

// Manual token form (existing functionality)
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
  // Store token in memory only (no persistence)
  inMemoryIdToken = nextToken;
  console.log('[VanillaChat] ID token saved to memory', {
    tokenLength: nextToken.length,
    isJWT: nextToken.split('.').length === 3,
  });

  // Create a new idTokenProvider that uses the updated token
  const updatedIdTokenProvider = async () => {
    console.log('[VanillaChat] Using JWT token from memory for token exchange');
    return inMemoryIdToken;
  };

  // Update the WebSocket manager's idTokenProvider to use the new token
  if (tokenExchangeConfig) {
    wsManager.setIdTokenProvider(updatedIdTokenProvider);
    console.log('[VanillaChat] Updated WebSocket manager with new ID token provider');
  }

  // Reinitialize chat with the new token provider
  chat.destroy();
  chat = attachSunnyChat({
    container: chatContainer!,
    anonymous: false,
    headerTitle: 'Sunny Chat',
    placeholder: 'Ask about your benefits…',
    colors: {
      primary: '#048db4',
      secondary: '#0c3c5c',
      accent: '#168c55',
    },
    passwordlessAuth,
    config: {
      websocketUrl,
      wsManager, // Share the same WebSocket manager
      idTokenProvider: updatedIdTokenProvider,
      ...(tokenExchangeConfig ? { tokenExchange: tokenExchangeConfig } : {}),
    },
  });

  // Trigger auth upgrade to upgrade the WebSocket connection from anonymous to authenticated
  if (tokenExchangeConfig) {
    try {
      console.log('[VanillaChat] Triggering auth upgrade with new token');
      const upgradeSuccess = await wsManager.upgradeAuthIfPossible(false);
      if (upgradeSuccess) {
        console.log('[VanillaChat] Auth upgrade successful');
      } else {
        console.warn('[VanillaChat] Auth upgrade returned false - connection may still be anonymous');
      }
    } catch (error) {
      console.error('[VanillaChat] Auth upgrade failed:', error);
      // Don't block - allow chat to continue, upgrade will retry on first message
    }
  }

  console.log('[VanillaChat] Chat reinitialized with new token');
  window.alert('ID Token saved to memory. Chat has been reinitialized with token exchange.');
});

clearTokenBtn?.addEventListener('click', () => {
  inMemoryIdToken = null;
  if (tokenInput) {
    tokenInput.value = '';
  }

  // Reinitialize chat in anonymous mode since token was cleared
  // Check if we have passwordless auth as fallback
  const hasPasswordlessAuth = passwordlessAuth.isAuthenticated();
  const fallbackIdTokenProvider = hasPasswordlessAuth
    ? async () => {
      console.warn('[VanillaChat] Using passwordless user ID as ID token (may not work for token exchange)');
      return passwordlessAuth.getUserId();
    }
    : undefined;

  // Update WebSocket manager if we have a fallback, otherwise clear it
  if (tokenExchangeConfig && fallbackIdTokenProvider) {
    wsManager.setIdTokenProvider(fallbackIdTokenProvider);
  } else if (tokenExchangeConfig) {
    // Clear the idTokenProvider from WebSocket manager
    wsManager.setIdTokenProvider(async () => null);
  }

  // Reinitialize chat
  chat.destroy();
  chat = attachSunnyChat({
    container: chatContainer!,
    anonymous: !hasPasswordlessAuth,
    headerTitle: 'Sunny Chat',
    placeholder: 'Ask about your benefits…',
    colors: {
      primary: '#048db4',
      secondary: '#0c3c5c',
      accent: '#168c55',
    },
    passwordlessAuth,
    config: {
      websocketUrl,
      wsManager,
      ...(fallbackIdTokenProvider ? { idTokenProvider: fallbackIdTokenProvider } : {}),
      ...(tokenExchangeConfig && fallbackIdTokenProvider ? { tokenExchange: tokenExchangeConfig } : {}),
    },
  });

  console.log('[VanillaChat] Chat reinitialized after token cleared');
  window.alert('ID Token cleared from memory. Chat has been reinitialized.');
});

// Expose token exchange test function to window for debugging
(window as any).testTokenExchange = async (token?: string) => {
  const testToken = token || envIdToken || inMemoryIdToken;
  if (!testToken) {
    console.error('[VanillaChat] No token provided and no token found in env/memory');
    return;
  }

  if (!tokenExchangeConfig) {
    console.error('[VanillaChat] No token exchange config available');
    return;
  }

  console.log('[VanillaChat] Testing token exchange', {
    tokenLength: testToken.length,
    tokenPrefix: testToken.substring(0, 20) + '...',
    config: tokenExchangeConfig,
  });

  try {
    // Import token exchange function from SDK package
    const { exchangeIdTokenForAccessToken } = await import('@sunnyhealthai/agents-sdk');
    if (!exchangeIdTokenForAccessToken || typeof exchangeIdTokenForAccessToken !== 'function') {
      throw new Error('exchangeIdTokenForAccessToken not found or not a function');
    }
    const response = await exchangeIdTokenForAccessToken(testToken, tokenExchangeConfig);
    console.log('[VanillaChat] Token exchange test successful!', {
      tokenType: response.token_type,
      expiresIn: response.expires_in,
      accessTokenLength: response.access_token.length,
      accessTokenPrefix: response.access_token.substring(0, 20) + '...',
    });
    return response;
  } catch (error) {
    console.error('[VanillaChat] Token exchange test failed:', error);
    throw error;
  }
};

window.addEventListener('beforeunload', () => {
  chat.destroy();
  passwordlessAuth.destroy();
});
