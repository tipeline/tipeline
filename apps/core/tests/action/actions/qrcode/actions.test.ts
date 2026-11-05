import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GroupQRCode } from '@/action/actions/qrcode/actions';

describe('GroupQRCode', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-qrcode-'));
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  describe('generate', () => {
    it('writes a QR code PNG file to the given path', async () => {
      const outputPath = path.join(workDir, 'code.png');

      const result = await GroupQRCode.generate({
        text: 'https://tipeline.io',
        path: outputPath,
      } as any);

      expect(result).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
    });

    it('creates missing parent directories automatically', async () => {
      const outputPath = path.join(workDir, 'nested', 'deep', 'code.png');
      expect(fs.existsSync(path.dirname(outputPath))).toBe(false);

      const result = await GroupQRCode.generate({
        text: 'nested output',
        path: outputPath,
      } as any);

      expect(result).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('throws a validation error when text is empty', async () => {
      await expect(
        GroupQRCode.generate({ text: '', path: path.join(workDir, 'code.png') } as any)
      ).rejects.toThrow();
    });

    it('throws a validation error when path is missing', async () => {
      await expect(GroupQRCode.generate({ text: 'no path' } as any)).rejects.toThrow();
    });
  });

  describe('read', () => {
    it('decodes the text previously encoded by generate', async () => {
      const outputPath = path.join(workDir, 'roundtrip.png');
      await GroupQRCode.generate({ text: 'round-trip-value', path: outputPath } as any);

      const result = await GroupQRCode.read({ path: outputPath } as any);
      expect(result).toBe('round-trip-value');
    });

    it('decodes a QR code containing a URL', async () => {
      const outputPath = path.join(workDir, 'url.png');
      await GroupQRCode.generate({ text: 'https://tipeline.io/tasks', path: outputPath } as any);

      const result = await GroupQRCode.read({ path: outputPath } as any);
      expect(result).toBe('https://tipeline.io/tasks');
    });

    it('throws when the image contains no QR code', async () => {
      // A blank raw PNG with no encoded QR data.
      const outputPath = path.join(workDir, 'blank.png');
      const sharp = (await import('sharp')).default;
      await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .png()
        .toFile(outputPath);

      await expect(GroupQRCode.read({ path: outputPath } as any)).rejects.toThrow(
        'No QR code found in the image.'
      );
    });

    it('throws a validation error when path is missing', async () => {
      await expect(GroupQRCode.read({} as any)).rejects.toThrow();
    });

    it('rejects when the image file does not exist', async () => {
      await expect(
        GroupQRCode.read({ path: path.join(workDir, 'missing.png') } as any)
      ).rejects.toThrow();
    });
  });
});
