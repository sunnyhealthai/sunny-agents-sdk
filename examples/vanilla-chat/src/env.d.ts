export {};

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUNNY_WS_URL?: string;
    readonly VITE_SUNNY_AUTHORIZE_URL?: string;
    readonly VITE_SUNNY_ACCESS_TOKEN?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
