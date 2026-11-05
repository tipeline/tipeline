import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { GroupFile } from '@/action/actions/file/actions';

describe('GroupFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tipeline-file-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  describe('fileExists', () => {
    it('resolves true when the file exists', async () => {
      const file = path.join(tmpDir, 'exists.txt');
      await fs.writeFile(file, 'hello');
      await expect(GroupFile.fileExists({ src: file })).resolves.toBe(true);
    });

    it('rejects when the file does not exist', async () => {
      const file = path.join(tmpDir, 'missing.txt');
      await expect(GroupFile.fileExists({ src: file })).rejects.toThrow();
    });

    it('throws a validation error when src is missing', async () => {
      await expect(GroupFile.fileExists({} as any)).rejects.toThrow();
    });
  });

  describe('copy', () => {
    it('copies a file to a new destination', async () => {
      const src = path.join(tmpDir, 'src.txt');
      const dest = path.join(tmpDir, 'dest.txt');
      await fs.writeFile(src, 'copy me');

      await expect(GroupFile.copy({ src, dest })).resolves.toBe(true);
      await expect(fs.readFile(dest, 'utf8')).resolves.toBe('copy me');
    });

    it('rejects when the source does not exist', async () => {
      const src = path.join(tmpDir, 'nope.txt');
      const dest = path.join(tmpDir, 'dest.txt');
      await expect(GroupFile.copy({ src, dest })).rejects.toThrow();
    });

    it('throws a validation error when dest is missing', async () => {
      await expect(GroupFile.copy({ src: tmpDir } as any)).rejects.toThrow();
    });
  });

  describe('move', () => {
    it('moves a file to a new destination', async () => {
      const src = path.join(tmpDir, 'src.txt');
      const dest = path.join(tmpDir, 'moved.txt');
      await fs.writeFile(src, 'move me');

      await expect(GroupFile.move({ src, dest })).resolves.toBe(true);
      await expect(fs.pathExists(src)).resolves.toBe(false);
      await expect(fs.readFile(dest, 'utf8')).resolves.toBe('move me');
    });

    it('rejects when the source does not exist', async () => {
      const src = path.join(tmpDir, 'nope.txt');
      const dest = path.join(tmpDir, 'moved.txt');
      await expect(GroupFile.move({ src, dest })).rejects.toThrow();
    });
  });

  describe('rename', () => {
    it('renames a file', async () => {
      const oldPath = path.join(tmpDir, 'old.txt');
      const newPath = path.join(tmpDir, 'new.txt');
      await fs.writeFile(oldPath, 'rename me');

      await expect(GroupFile.rename({ oldPath, newPath })).resolves.toBe(true);
      await expect(fs.pathExists(oldPath)).resolves.toBe(false);
      await expect(fs.readFile(newPath, 'utf8')).resolves.toBe('rename me');
    });

    it('rejects when the old path does not exist', async () => {
      const oldPath = path.join(tmpDir, 'missing.txt');
      const newPath = path.join(tmpDir, 'new.txt');
      await expect(GroupFile.rename({ oldPath, newPath })).rejects.toThrow();
    });

    it('throws a validation error when newPath is missing', async () => {
      await expect(GroupFile.rename({ oldPath: tmpDir } as any)).rejects.toThrow();
    });
  });

  describe('remove', () => {
    it('removes an existing file', async () => {
      const file = path.join(tmpDir, 'toRemove.txt');
      await fs.writeFile(file, 'bye');

      await expect(GroupFile.remove({ src: file })).resolves.toBe(true);
      await expect(fs.pathExists(file)).resolves.toBe(false);
    });

    it('resolves true even when the path does not exist (fs-extra remove is idempotent)', async () => {
      const file = path.join(tmpDir, 'never-existed.txt');
      await expect(GroupFile.remove({ src: file })).resolves.toBe(true);
    });
  });

  describe('read', () => {
    it('reads file content as a utf-8 string', async () => {
      const file = path.join(tmpDir, 'read.txt');
      await fs.writeFile(file, 'file contents');

      await expect(GroupFile.read({ src: file })).resolves.toBe('file contents');
    });

    it('rejects when the file does not exist', async () => {
      const file = path.join(tmpDir, 'missing.txt');
      await expect(GroupFile.read({ src: file })).rejects.toThrow();
    });
  });

  describe('write', () => {
    it('writes text to a file', async () => {
      const file = path.join(tmpDir, 'write.txt');
      await expect(GroupFile.write({ src: file, data: 'written content' })).resolves.toBe(true);
      await expect(fs.readFile(file, 'utf8')).resolves.toBe('written content');
    });

    it('creates missing parent directories', async () => {
      const file = path.join(tmpDir, 'nested', 'deep', 'write.txt');
      await expect(GroupFile.write({ src: file, data: 'nested content' })).resolves.toBe(true);
      await expect(fs.readFile(file, 'utf8')).resolves.toBe('nested content');
    });

    it('throws a validation error when data is missing', async () => {
      await expect(GroupFile.write({ src: path.join(tmpDir, 'x.txt') } as any)).rejects.toThrow();
    });
  });

  describe('readCSV', () => {
    const options = { columns: true, skip_empty_lines: true, delimiter: ',', trim: true };

    it('parses a CSV file into row objects', async () => {
      const file = path.join(tmpDir, 'data.csv');
      await fs.writeFile(file, 'name,amount\nAcme,100\nGlobex,200\n');

      const rows = await GroupFile.readCSV({ src: file, options });
      expect(rows).toEqual([
        { name: 'Acme', amount: '100' },
        { name: 'Globex', amount: '200' },
      ]);
    });

    it('skips empty lines when skip_empty_lines is true', async () => {
      const file = path.join(tmpDir, 'data.csv');
      await fs.writeFile(file, 'name,amount\nAcme,100\n\nGlobex,200\n');

      const rows = await GroupFile.readCSV({ src: file, options });
      expect(rows).toHaveLength(2);
    });

    it('rejects when the source file does not exist', async () => {
      const file = path.join(tmpDir, 'missing.csv');
      await expect(GroupFile.readCSV({ src: file, options })).rejects.toThrow();
    });

    it('throws a validation error when options are incomplete', async () => {
      const file = path.join(tmpDir, 'data.csv');
      await fs.writeFile(file, 'name\nAcme\n');
      await expect(
        GroupFile.readCSV({ src: file, options: { columns: true } } as any)
      ).rejects.toThrow();
    });
  });

  describe('writeCSV', () => {
    it('writes row objects to a CSV file with a header', async () => {
      const file = path.join(tmpDir, 'out.csv');
      const rows = [
        { invoice: 'INV-001', amount: 4200 },
        { invoice: 'INV-002', amount: 8750 },
      ];

      await expect(GroupFile.writeCSV({ src: file, rows })).resolves.toBe(true);
      const content = await fs.readFile(file, 'utf8');
      expect(content).toBe('invoice,amount\nINV-001,4200\nINV-002,8750\n');
    });

    it('creates missing parent directories', async () => {
      const file = path.join(tmpDir, 'nested', 'out.csv');
      await expect(GroupFile.writeCSV({ src: file, rows: [{ a: 1 }] })).resolves.toBe(true);
      await expect(fs.pathExists(file)).resolves.toBe(true);
    });

    it('throws a validation error when rows is not an array', async () => {
      await expect(
        GroupFile.writeCSV({ src: path.join(tmpDir, 'out.csv'), rows: 'not-an-array' } as any)
      ).rejects.toThrow();
    });
  });

  describe('getFilePathPart', () => {
    const src = '/some/dir/report.final.txt';

    it('extracts the dirname', async () => {
      await expect(GroupFile.getFilePathPart({ src, part: 'dirname' })).resolves.toBe('/some/dir');
    });

    it('extracts the basename', async () => {
      await expect(GroupFile.getFilePathPart({ src, part: 'basename' })).resolves.toBe(
        'report.final.txt'
      );
    });

    it('extracts the extname', async () => {
      await expect(GroupFile.getFilePathPart({ src, part: 'extname' })).resolves.toBe('.txt');
    });

    it('extracts the filename without extension', async () => {
      await expect(GroupFile.getFilePathPart({ src, part: 'filename' })).resolves.toBe(
        'report.final'
      );
    });

    it('extracts the root', async () => {
      await expect(GroupFile.getFilePathPart({ src, part: 'root' })).resolves.toBe('/');
    });

    it('throws a validation error for an unknown part', async () => {
      await expect(
        GroupFile.getFilePathPart({ src, part: 'unknownPart' } as any)
      ).rejects.toThrow();
    });
  });

  describe('convertFileToBase64', () => {
    it('encodes file content as base64', async () => {
      const file = path.join(tmpDir, 'b64.txt');
      await fs.writeFile(file, 'hello world');

      const result = await GroupFile.convertFileToBase64({ src: file });
      expect(result).toBe(Buffer.from('hello world').toString('base64'));
    });

    it('rejects when the source file does not exist', async () => {
      const file = path.join(tmpDir, 'missing.txt');
      await expect(GroupFile.convertFileToBase64({ src: file })).rejects.toThrow();
    });
  });

  describe('convertBase64ToFile', () => {
    it('decodes base64 and writes it to a file', async () => {
      const dest = path.join(tmpDir, 'decoded.txt');
      const base64 = Buffer.from('decoded content').toString('base64');

      await expect(GroupFile.convertBase64ToFile({ dest, base64 })).resolves.toBe(true);
      await expect(fs.readFile(dest, 'utf8')).resolves.toBe('decoded content');
    });

    it('creates missing parent directories', async () => {
      const dest = path.join(tmpDir, 'nested', 'decoded.txt');
      const base64 = Buffer.from('nested content').toString('base64');

      await expect(GroupFile.convertBase64ToFile({ dest, base64 })).resolves.toBe(true);
      await expect(fs.pathExists(dest)).resolves.toBe(true);
    });

    it('throws a validation error when base64 is missing', async () => {
      await expect(
        GroupFile.convertBase64ToFile({ dest: path.join(tmpDir, 'x.txt') } as any)
      ).rejects.toThrow();
    });
  });
});
