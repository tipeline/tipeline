import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GroupCompression } from '@/action/actions/compression/actions';

describe('GroupCompression', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-compression-'));
  });

  afterEach(async () => {
    // Source note: GroupCompression.archive() rejects synchronously when a source is
    // missing, but the underlying fs.createWriteStream ("baseStream") for the output
    // path has no 'error' listener attached (only `archive.on('error')` is wired up —
    // see apps/core/src/action/actions/compression/actions.ts around line 46-59). The
    // write stream's async `open()` can still be in flight when this hook runs; giving
    // it a brief tick to settle before removing the directory avoids a stray ENOENT
    // surfacing as an unhandled exception outside the test.
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  describe('archive', () => {
    it('creates a zip archive from a single file', async () => {
      const sourceFile = path.join(workDir, 'hello.txt');
      fs.writeFileSync(sourceFile, 'hello world');
      const outputPath = path.join(workDir, 'out.zip');

      const result = await GroupCompression.archive({
        path: outputPath,
        sources: [sourceFile],
        format: 'zip',
      } as any);

      expect(result).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
    });

    it('creates a tar.gz archive from a directory', async () => {
      const sourceDir = path.join(workDir, 'folder');
      fs.mkdirSync(sourceDir);
      fs.writeFileSync(path.join(sourceDir, 'a.txt'), 'a content');
      fs.writeFileSync(path.join(sourceDir, 'b.txt'), 'b content');
      const outputPath = path.join(workDir, 'out.tar.gz');

      const result = await GroupCompression.archive({
        path: outputPath,
        sources: [sourceDir],
        format: 'tar.gz',
        level: 6,
      } as any);

      expect(result).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
    });

    it('creates a plain tar archive using a glob pattern', async () => {
      fs.writeFileSync(path.join(workDir, 'one.txt'), 'one');
      fs.writeFileSync(path.join(workDir, 'two.txt'), 'two');
      const outputPath = path.join(workDir, 'out.tar');

      const result = await GroupCompression.archive({
        path: outputPath,
        sources: [path.join(workDir, '*.txt')],
        format: 'tar',
      } as any);

      expect(result).toBe(true);
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
    });

    it('rejects when a non-glob source does not exist', async () => {
      const outputPath = path.join(workDir, 'out.zip');

      await expect(
        GroupCompression.archive({
          path: outputPath,
          sources: [path.join(workDir, 'missing.txt')],
          format: 'zip',
        } as any)
      ).rejects.toThrow(/Source not found/);
    });

    it('throws a validation error when format is missing', async () => {
      await expect(
        GroupCompression.archive({
          path: path.join(workDir, 'out.zip'),
          sources: [workDir],
        } as any)
      ).rejects.toThrow();
    });

    it('throws a validation error when sources is not an array', async () => {
      await expect(
        GroupCompression.archive({
          path: path.join(workDir, 'out.zip'),
          sources: 'not-an-array',
          format: 'zip',
        } as any)
      ).rejects.toThrow();
    });
  });

  describe('unarchive', () => {
    it('extracts a zip archive created by archive()', async () => {
      const sourceFile = path.join(workDir, 'content.txt');
      fs.writeFileSync(sourceFile, 'extracted content');
      const archivePath = path.join(workDir, 'archive.zip');

      await GroupCompression.archive({
        path: archivePath,
        sources: [sourceFile],
        format: 'zip',
      } as any);

      const destination = path.join(workDir, 'extracted');
      const result = await GroupCompression.unarchive({
        path: archivePath,
        destination,
      } as any);

      expect(result).toBe(true);
      expect(fs.existsSync(path.join(destination, 'content.txt'))).toBe(true);
      expect(fs.readFileSync(path.join(destination, 'content.txt'), 'utf8')).toBe(
        'extracted content'
      );
    });

    it('extracts a tar.gz archive and creates the destination directory if missing', async () => {
      const sourceFile = path.join(workDir, 'content.txt');
      fs.writeFileSync(sourceFile, 'tar gz content');
      const archivePath = path.join(workDir, 'archive.tar.gz');

      await GroupCompression.archive({
        path: archivePath,
        sources: [sourceFile],
        format: 'tar.gz',
      } as any);

      const destination = path.join(workDir, 'nested', 'extracted-dir');
      expect(fs.existsSync(destination)).toBe(false);

      const result = await GroupCompression.unarchive({
        path: archivePath,
        destination,
      } as any);

      expect(result).toBe(true);
      expect(fs.existsSync(path.join(destination, 'content.txt'))).toBe(true);
    });

    it('throws for an unsupported archive format', async () => {
      const bogusPath = path.join(workDir, 'archive.rar');
      fs.writeFileSync(bogusPath, 'not really an archive');

      await expect(
        GroupCompression.unarchive({
          path: bogusPath,
          destination: path.join(workDir, 'out'),
        } as any)
      ).rejects.toThrow(/Unsupported archive format/);
    });

    it('throws a validation error when destination is missing', async () => {
      await expect(
        GroupCompression.unarchive({
          path: path.join(workDir, 'archive.zip'),
        } as any)
      ).rejects.toThrow();
    });
  });
});
