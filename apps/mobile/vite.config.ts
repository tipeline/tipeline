import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

// A fixed port: the Server only answers browsers from origins it lists, so
// TIPELINE_CORS_ORIGINS=http://localhost:5180 has to match this address.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared-assets': path.resolve(__dirname, '../../assets'),
    },
  },
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  test: {
    environment: 'happy-dom',
  },
});
