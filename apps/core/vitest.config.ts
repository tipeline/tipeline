import { defineConfig } from 'vitest/config';
import os from 'node:os';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Tests seal values too, and must not create the real key in ~/Tipeline.
    env: { TIPELINE_SECRET_KEY_FILE: path.join(os.tmpdir(), `tipeline-test-secret-${process.pid}.key`) },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@step': path.resolve(__dirname, 'src/step'),
      '@variable': path.resolve(__dirname, 'src/variable'),
      '@pipeline': path.resolve(__dirname, 'src/pipeline'),
      '@action': path.resolve(__dirname, 'src/action'),
      '@task': path.resolve(__dirname, 'src/task'),
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@database': path.resolve(__dirname, 'src/database'),
      '@validation': path.resolve(__dirname, 'src/validation'),
      '@translation': path.resolve(__dirname, 'src/translation'),
    },
  },
});
