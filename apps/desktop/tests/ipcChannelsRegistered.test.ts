import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SEND } from '@/ipc-channels';

// A channel the renderer sends but the main process never registers is silently
// dropped: invokeCore rejects and the page falls back as if Core had nothing. That
// hid the project delete preview once, so every one must appear in electron/main.
const mainDir = path.resolve(__dirname, '../electron/main');
const mainSource = (fs.readdirSync(mainDir, { recursive: true }) as string[])
  .filter((file) => file.endsWith('.ts') && !file.includes('ipc-channels'))
  .map((file) => fs.readFileSync(path.join(mainDir, file), 'utf8'))
  .join('\n');

describe('renderer IPC channels', () => {
  it('are all handled in the Electron main process', () => {
    const missing = Object.keys(SEND).filter((key) => !new RegExp(`SEND\\.${key}\\b`).test(mainSource));
    expect(missing).toEqual([]);
  });
});
