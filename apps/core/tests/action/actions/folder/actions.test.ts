import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { GroupFolder } from '@/action/actions/folder/actions';

describe('GroupFolder', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tipeline-folder-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  describe('exists', () => {
    it('resolves true for an existing directory', async () => {
      const dir = path.join(tmpDir, 'sub');
      await fs.mkdirp(dir);
      await expect(GroupFolder.exists({ src: dir })).resolves.toBe(true);
    });

    it('resolves false when the path is a file, not a directory', async () => {
      const file = path.join(tmpDir, 'file.txt');
      await fs.writeFile(file, 'not a folder');
      await expect(GroupFolder.exists({ src: file })).resolves.toBe(false);
    });

    it('rejects when the path does not exist', async () => {
      const dir = path.join(tmpDir, 'missing');
      await expect(GroupFolder.exists({ src: dir })).rejects.toThrow();
    });

    it('throws a validation error when src is missing', async () => {
      await expect(GroupFolder.exists({} as any)).rejects.toThrow();
    });
  });

  describe('getFiles', () => {
    it('lists entries in a folder', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a');
      await fs.writeFile(path.join(tmpDir, 'b.txt'), 'b');

      const files = await GroupFolder.getFiles({ src: tmpDir });
      expect(files.sort()).toEqual(['a.txt', 'b.txt']);
    });

    it('returns an empty array for an empty folder', async () => {
      const dir = path.join(tmpDir, 'empty');
      await fs.mkdirp(dir);
      await expect(GroupFolder.getFiles({ src: dir })).resolves.toEqual([]);
    });

    it('rejects when the folder does not exist', async () => {
      const dir = path.join(tmpDir, 'missing');
      await expect(GroupFolder.getFiles({ src: dir })).rejects.toThrow();
    });

    it('returns full paths when fullPaths is true', async () => {
      await fs.writeFile(path.join(tmpDir, 'a.txt'), 'a');
      const files = await GroupFolder.getFiles({ src: tmpDir, fullPaths: true });
      expect(files).toEqual([path.join(tmpDir, 'a.txt')]);
    });

    it('keeps only files with the given extensions, any case, leaving out subfolders', async () => {
      await fs.writeFile(path.join(tmpDir, 'aa.JPG'), 'x');
      await fs.writeFile(path.join(tmpDir, 'bb.png'), 'x');
      await fs.writeFile(path.join(tmpDir, 'notes.txt'), 'x');
      await fs.writeFile(path.join(tmpDir, '.DS_Store'), 'x');
      await fs.mkdirp(path.join(tmpDir, 'sub.jpg'));

      const files = await GroupFolder.getFiles({ src: tmpDir, extensions: ['jpg', '.png'] });
      expect(files.sort()).toEqual(['aa.JPG', 'bb.png']);
    });

    it('combines extensions with fullPaths', async () => {
      await fs.writeFile(path.join(tmpDir, 'aa.JPG'), 'x');
      await fs.writeFile(path.join(tmpDir, 'notes.txt'), 'x');
      const files = await GroupFolder.getFiles({ src: tmpDir, extensions: ['jpg'], fullPaths: true });
      expect(files).toEqual([path.join(tmpDir, 'aa.JPG')]);
    });
  });

  describe('getSubfolders', () => {
    it('lists only subdirectory names, excluding files', async () => {
      await fs.mkdirp(path.join(tmpDir, 'sub1'));
      await fs.mkdirp(path.join(tmpDir, 'sub2'));
      await fs.writeFile(path.join(tmpDir, 'file.txt'), 'x');

      const subfolders = await GroupFolder.getSubfolders({ src: tmpDir });
      expect(subfolders.sort()).toEqual(['sub1', 'sub2']);
    });

    it('returns an empty array when there are no subfolders', async () => {
      await fs.writeFile(path.join(tmpDir, 'file.txt'), 'x');
      await expect(GroupFolder.getSubfolders({ src: tmpDir })).resolves.toEqual([]);
    });
  });

  describe('create', () => {
    it('creates a folder and returns the created path', async () => {
      const dir = path.join(tmpDir, 'newDir');
      const created = await GroupFolder.create({ src: dir });
      expect(created).toBe(dir);
      await expect(fs.pathExists(dir)).resolves.toBe(true);
    });

    it('creates nested missing parent directories', async () => {
      const dir = path.join(tmpDir, 'a', 'b', 'c');
      await GroupFolder.create({ src: dir });
      await expect(fs.pathExists(dir)).resolves.toBe(true);
    });

    it('resolves undefined when the folder already exists', async () => {
      const dir = path.join(tmpDir, 'already');
      await fs.mkdirp(dir);
      await expect(GroupFolder.create({ src: dir })).resolves.toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes a folder and its contents', async () => {
      const dir = path.join(tmpDir, 'toDelete');
      await fs.mkdirp(dir);
      await fs.writeFile(path.join(dir, 'file.txt'), 'x');

      await expect(GroupFolder.delete({ src: dir })).resolves.toBe(true);
      await expect(fs.pathExists(dir)).resolves.toBe(false);
    });

    it('resolves true even when the folder does not exist', async () => {
      const dir = path.join(tmpDir, 'never-existed');
      await expect(GroupFolder.delete({ src: dir })).resolves.toBe(true);
    });
  });

  describe('empty', () => {
    it('removes all contents but keeps the folder', async () => {
      const dir = path.join(tmpDir, 'toEmpty');
      await fs.mkdirp(dir);
      await fs.writeFile(path.join(dir, 'file.txt'), 'x');

      await expect(GroupFolder.empty({ src: dir })).resolves.toBe(true);
      await expect(fs.pathExists(dir)).resolves.toBe(true);
      await expect(fs.readdir(dir)).resolves.toEqual([]);
    });

    it('creates the folder when it does not already exist', async () => {
      const dir = path.join(tmpDir, 'not-there-yet');
      await expect(GroupFolder.empty({ src: dir })).resolves.toBe(true);
      await expect(fs.pathExists(dir)).resolves.toBe(true);
    });
  });

  describe('copy', () => {
    it('copies a folder and its contents to a destination', async () => {
      const src = path.join(tmpDir, 'src');
      const dest = path.join(tmpDir, 'dest');
      await fs.mkdirp(src);
      await fs.writeFile(path.join(src, 'file.txt'), 'contents');

      await expect(GroupFolder.copy({ src, dest })).resolves.toBe(true);
      await expect(fs.readFile(path.join(dest, 'file.txt'), 'utf8')).resolves.toBe('contents');
      await expect(fs.pathExists(src)).resolves.toBe(true);
    });

    it('rejects when the source folder does not exist', async () => {
      const src = path.join(tmpDir, 'missing');
      const dest = path.join(tmpDir, 'dest');
      await expect(GroupFolder.copy({ src, dest })).rejects.toThrow();
    });
  });

  describe('move', () => {
    it('moves a folder to a destination', async () => {
      const src = path.join(tmpDir, 'src');
      const dest = path.join(tmpDir, 'dest');
      await fs.mkdirp(src);
      await fs.writeFile(path.join(src, 'file.txt'), 'contents');

      await expect(GroupFolder.move({ src, dest })).resolves.toBe(true);
      await expect(fs.pathExists(src)).resolves.toBe(false);
      await expect(fs.readFile(path.join(dest, 'file.txt'), 'utf8')).resolves.toBe('contents');
    });

    it('rejects when the source folder does not exist', async () => {
      const src = path.join(tmpDir, 'missing');
      const dest = path.join(tmpDir, 'dest');
      await expect(GroupFolder.move({ src, dest })).rejects.toThrow();
    });
  });

  describe('rename', () => {
    it('renames a folder', async () => {
      const oldPath = path.join(tmpDir, 'old');
      const newPath = path.join(tmpDir, 'new');
      await fs.mkdirp(oldPath);

      await expect(GroupFolder.rename({ oldPath, newPath })).resolves.toBe(true);
      await expect(fs.pathExists(oldPath)).resolves.toBe(false);
      await expect(fs.pathExists(newPath)).resolves.toBe(true);
    });

    it('rejects when the old path does not exist', async () => {
      const oldPath = path.join(tmpDir, 'missing');
      const newPath = path.join(tmpDir, 'new');
      await expect(GroupFolder.rename({ oldPath, newPath })).rejects.toThrow();
    });

    it('throws a validation error when newPath is missing', async () => {
      await expect(GroupFolder.rename({ oldPath: tmpDir } as any)).rejects.toThrow();
    });
  });
});
