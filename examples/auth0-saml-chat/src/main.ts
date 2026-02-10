import { createSunnyChat } from '@sunnyhealthai/agents-sdk';

// Configuration from environment variables
const partnerIdentifier = (import.meta.env.VITE_SUNNY_PARTNER_NAME as string | undefined) ?? '';
const publicKey = (import.meta.env.VITE_SUNNY_PUBLIC_KEY as string | undefined) ?? '';
const websocketUrl = (import.meta.env.VITE_SUNNY_WS_URL as string | undefined) ?? 'wss://llm.sunnyhealth.live';

// UI Elements
const authStatusText = document.getElementById('auth-status-text') as HTMLElement;
const authLoginButton = document.getElementById('auth-login') as HTMLButtonElement;
const authLogoutButton = document.getElementById('auth-logout') as HTMLButtonElement;
const chatContainer = document.getElementById('sunny-chat-container') as HTMLElement;

let chatInstance: Awaited<ReturnType<typeof createSunnyChat>> | null = null;

// Update auth status UI
function updateAuthStatus() {
  authStatusText.textContent = 'Authentication handled automatically via SAML';
  authStatusText.className = 'authenticated';
  authLoginButton.style.display = 'none';
  authLogoutButton.style.display = 'inline-block';
}

// Initialize chat with simplified API
async function initializeChat() {
  if (!partnerIdentifier || !publicKey) {
    console.warn('[Auth0Example] VITE_SUNNY_PARTNER_NAME and VITE_SUNNY_PUBLIC_KEY are required');
    authStatusText.textContent = 'Please configure partner identifier and public key in .env';
    authStatusText.className = 'not-authenticated';
    return;
  }

  // Destroy existing chat instance if any
  if (chatInstance) {
    chatInstance.destroy();
    chatInstance = null;
  }

  try {
    // Use the new simplified API -- all Auth0 config comes from the server
    chatInstance = await createSunnyChat({
      container: chatContainer,
      partnerIdentifier,
      publicKey,
      authType: 'saml',
      websocketUrl,
      headerTitle: 'Sunny Agents (Auth0 SAML)',
      placeholder: 'Ask anything…',
    });

    updateAuthStatus();
  } catch (error) {
    console.error('[Auth0Example] Failed to initialize chat:', error);
    authStatusText.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
    authStatusText.className = 'not-authenticated';
  }
}

// Login handler
authLoginButton.addEventListener('click', async () => {
  await initializeChat();
});

// Logout handler
authLogoutButton.addEventListener('click', () => {
  if (chatInstance) {
    chatInstance.destroy();
    chatInstance = null;
  }
  window.location.reload();
});

// Initialize on page load
initializeChat();
