export {};

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUNNY_WS_URL?: string;
    readonly VITE_SUNNY_AUTHORIZE_URL?: string;
    readonly VITE_SUNNY_ID_TOKEN?: string;
    readonly VITE_SUNNY_PARTNER_NAME?: string;
    readonly VITE_SUNNY_AUDIENCE?: string;
    readonly VITE_SUNNY_CLIENT_ID?: string;
    readonly VITE_SUNNY_TOKEN_EXCHANGE_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
