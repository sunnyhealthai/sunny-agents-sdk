import { createSunnyChat } from '@sunnyhealthai/agents-sdk';

// Configuration from environment variables
const websocketUrl = (import.meta.env.VITE_SUNNY_WS_URL as string | undefined) ?? 'wss://llm.sunnyhealth.live';
const apiBaseUrl = (import.meta.env.VITE_SUNNY_AUDIENCE as string | undefined) ?? 'https://api.sunnyhealthai-staging.com';

// Auth0 configuration from environment variables
const AUTH0_DOMAIN = (import.meta.env.VITE_AUTH0_DOMAIN as string | undefined) ?? '';
const AUTH0_CLIENT_ID = (import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined) ?? '';
const AUTH0_CONNECTION = (import.meta.env.VITE_AUTH0_CONNECTION as string | undefined) ?? 'guardian-saml';
const AUTH0_ORGANIZATION = (import.meta.env.VITE_AUTH0_ORGANIZATION as string | undefined) ?? '';

// UI Elements
const auth0DomainInput = document.getElementById('auth0-domain') as HTMLInputElement;
const auth0ClientIdInput = document.getElementById('auth0-client-id') as HTMLInputElement;
const auth0ConnectionInput = document.getElementById('auth0-connection') as HTMLInputElement;
const auth0OrganizationInput = document.getElementById('auth0-organization') as HTMLInputElement;
const authStatusText = document.getElementById('auth-status-text') as HTMLElement;
const authLoginButton = document.getElementById('auth-login') as HTMLButtonElement;
const authLogoutButton = document.getElementById('auth-logout') as HTMLButtonElement;
const chatContainer = document.getElementById('sunny-chat-container') as HTMLElement;

// Set default values from env vars
if (AUTH0_DOMAIN) auth0DomainInput.value = AUTH0_DOMAIN;
if (AUTH0_CLIENT_ID) auth0ClientIdInput.value = AUTH0_CLIENT_ID;
if (AUTH0_CONNECTION) auth0ConnectionInput.value = AUTH0_CONNECTION;
if (AUTH0_ORGANIZATION) auth0OrganizationInput.value = AUTH0_ORGANIZATION;

let chatInstance: Awaited<ReturnType<typeof createSunnyChat>> | null = null;

// Update auth status UI (simplified - auth is handled automatically)
function updateAuthStatus() {
  // Note: With createSunnyChat, authentication happens automatically
  // This UI is kept for demonstration purposes
  authStatusText.textContent = 'Authentication handled automatically';
  authStatusText.className = 'authenticated';
  authLoginButton.style.display = 'none';
  authLogoutButton.style.display = 'none';
}

// Initialize chat with simplified API
async function initializeChat() {
  const domain = auth0DomainInput.value.trim();
  const clientId = auth0ClientIdInput.value.trim();
  const connection = auth0ConnectionInput.value.trim();
  const organization = auth0OrganizationInput.value.trim() || undefined;

  if (!domain || !clientId || !connection) {
    console.warn('[Auth0Example] Auth0 domain, client ID, and connection are required');
    authStatusText.textContent = 'Please configure Auth0 domain, client ID, and connection';
    authStatusText.className = 'not-authenticated';
    return;
  }

  // Destroy existing chat instance if any
  if (chatInstance) {
    chatInstance.destroy();
    chatInstance = null;
  }

  try {
    // Use the new unified API - authentication happens automatically
    chatInstance = await createSunnyChat({
      container: chatContainer,
      websocketUrl,
      apiBaseUrl,
      auth: {
        type: 'saml', // or 'oidc' for OIDC connections
        domain,
        clientId,
        connection, // SAML connection name - triggers auto-login (required)
        organization,
        audience: apiBaseUrl,
        usePopup: true,
        useModal: true,
        storageType: 'sessionStorage',
      },
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

// Login handler (kept for UI compatibility, but auth happens automatically)
authLoginButton.addEventListener('click', async () => {
  await initializeChat();
});

// Logout handler
authLogoutButton.addEventListener('click', () => {
  if (chatInstance) {
    chatInstance.destroy();
    chatInstance = null;
  }
  // Clear any stored tokens by reloading
  window.location.reload();
});

// Watch for config changes
[auth0DomainInput, auth0ClientIdInput, auth0ConnectionInput, auth0OrganizationInput].forEach((input) => {
  input.addEventListener('change', () => {
    // Reinitialize chat when config changes
    initializeChat();
  });
});

// Initialize on page load
initializeChat();
