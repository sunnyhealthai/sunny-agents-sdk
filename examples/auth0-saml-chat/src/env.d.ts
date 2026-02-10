export { };

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUNNY_WS_URL?: string;
    readonly VITE_SUNNY_PARTNER_NAME?: string;
    readonly VITE_SUNNY_PUBLIC_KEY?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
