#!/usr/bin/env node
import { ServerApp } from './ServerApp.js';

process.on('uncaughtException', (err) => console.error('[Server] uncaughtException:', err));
process.on('unhandledRejection', (reason) => console.error('[Server] unhandledRejection:', reason));

new ServerApp().start().catch((err) => {
  console.error('[Server] Failed to start:', err);
  process.exit(1);
});
