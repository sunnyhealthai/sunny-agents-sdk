import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  server: {
    host: true,
    port: 5175,
    allowedHosts: ['longtime-rathely-florance.ngrok-free.dev', 'nik.sunny-agents-sdk.sunnyhealth.dev']
  },
  resolve: {
    alias: {
      // Point to source files for hot reload during development
      '@sunnyhealthai/agents-sdk': resolve(__dirname, '../../src/index.ts'),
    },
  },
});
