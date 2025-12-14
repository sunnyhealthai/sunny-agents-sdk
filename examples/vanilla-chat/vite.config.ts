import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  resolve: {
    alias: {
      // Point to source files for hot reload during development
      '@sunnyhealthai/agents-sdk': path.resolve(__dirname, '../../src/index.ts'),
    },
  },
});
