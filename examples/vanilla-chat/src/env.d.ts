export { };

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUNNY_WS_URL?: string;
    readonly VITE_SUNNY_AUTHORIZE_URL?: string;
    readonly VITE_SUNNY_ID_TOKEN?: string;
    readonly VITE_SUNNY_PARTNER_NAME?: string;
    readonly VITE_SUNNY_AUDIENCE?: string;
    readonly VITE_SUNNY_CLIENT_ID?: string;
    readonly VITE_SUNNY_ORGANIZATION?: string;
    readonly VITE_SUNNY_TOKEN_EXCHANGE_URL?: string;
    readonly VITE_SUNNY_DEV_ROUTE?: string;
    readonly VITE_AUTH0_DOMAIN?: string;
    readonly VITE_AUTH0_CLIENT_ID?: string;
    readonly VITE_BASE_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
