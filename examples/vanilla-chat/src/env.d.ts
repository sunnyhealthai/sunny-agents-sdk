export { };

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUNNY_WS_URL?: string;
    readonly VITE_SUNNY_PARTNER_NAME?: string;
    readonly VITE_SUNNY_PUBLIC_KEY?: string;
    readonly VITE_SUNNY_AUTH_TYPE?: string;
    readonly VITE_SUNNY_ID_TOKEN?: string;
    readonly VITE_SUNNY_DEV_ROUTE?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
