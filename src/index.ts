export * from './types';
export { SunnyAgentsClient } from './client/SunnyAgentsClient';
export { attachSunnyChat, type VanillaChatOptions, type VanillaChatInstance, type VanillaChatColors, type VanillaChatDimensions } from './ui/vanillaChat';

// Unified entry point - recommended API
export { createSunnyChat } from './createSunnyChat';

// Internal APIs - exported for advanced use cases but not recommended for most users
/** @internal */
export { PasswordlessAuthManager, type PasswordlessAuthConfig, type PasswordlessStartOptions, type PasswordlessVerifyOptions } from './client/passwordlessAuth';
/** @internal */
export { LLMWebSocketManager } from './client/llmWebSocket';
/** @internal */
export type { LLMWebSocketConfig, AuthUpgradeHandler, MessageHandler, UpgradeAuthIfPossibleOptions } from './client/llmWebSocket';
/** @internal */
export { exchangeIdTokenForAccessToken, TokenExchangeManager, type TokenExchangeConfig, type TokenExchangeResponse } from './client/tokenExchange';

