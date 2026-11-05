import { defineConfig } from 'vitest/config';
import path from 'node:path';
import vue from '@vitejs/plugin-vue';

// Unit tests for renderer logic that doesn't need Electron. Node environment by
// default; component tests opt into a DOM with `// @vitest-environment happy-dom`.
// Tests stub `window.ipcRenderer` themselves when they need it.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
