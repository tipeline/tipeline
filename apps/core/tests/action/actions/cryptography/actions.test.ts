import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { GroupCryptography } from '@/action/actions/cryptography/actions';

describe('GroupCryptography', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-cryptography-'));
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  describe('base64EncodeText', () => {
    it('encodes a plain-text string to base64', async () => {
      const result = await GroupCryptography.base64EncodeText({ text: 'hello world' } as any);
      expect(result).toBe(Buffer.from('hello world', 'utf8').toString('base64'));
    });

    it('round-trips through base64DecodeText', async () => {
      const encoded = await GroupCryptography.base64EncodeText({ text: 'tipeline' } as any);
      const decoded = await GroupCryptography.base64DecodeText({ base64String: encoded } as any);
      expect(decoded).toBe('tipeline');
    });

    it('throws a validation error when text is missing', async () => {
      await expect(GroupCryptography.base64EncodeText({} as any)).rejects.toThrow();
    });

    it('throws a validation error when text is an empty string', async () => {
      await expect(GroupCryptography.base64EncodeText({ text: '' } as any)).rejects.toThrow();
    });
  });

  describe('base64EncodeFile', () => {
    it('encodes a file on disk to base64', async () => {
      const filePath = path.join(workDir, 'input.txt');
      fs.writeFileSync(filePath, 'file contents');

      const result = await GroupCryptography.base64EncodeFile({ filePath } as any);
      expect(result).toBe(Buffer.from('file contents').toString('base64'));
    });

    it('throws when the file does not exist', async () => {
      await expect(
        GroupCryptography.base64EncodeFile({ filePath: path.join(workDir, 'missing.txt') } as any)
      ).rejects.toThrow('File not found.');
    });

    it('throws a validation error when filePath is missing', async () => {
      await expect(GroupCryptography.base64EncodeFile({} as any)).rejects.toThrow();
    });
  });

  describe('base64DecodeText', () => {
    it('decodes a base64 string back to plain text', async () => {
      const result = await GroupCryptography.base64DecodeText({
        base64String: Buffer.from('hello world').toString('base64'),
      } as any);
      expect(result).toBe('hello world');
    });

    it('throws a validation error when base64String is missing', async () => {
      await expect(GroupCryptography.base64DecodeText({} as any)).rejects.toThrow();
    });
  });

  describe('base64DecodeToFile', () => {
    it('writes decoded bytes to the output file', async () => {
      const outputFilePath = path.join(workDir, 'output.txt');
      const base64String = Buffer.from('decoded content').toString('base64');

      const result = await GroupCryptography.base64DecodeToFile({
        base64String,
        outputFilePath,
      } as any);

      expect(result).toBe(true);
      expect(fs.readFileSync(outputFilePath, 'utf8')).toBe('decoded content');
    });

    it('throws a validation error when outputFilePath is missing', async () => {
      await expect(
        GroupCryptography.base64DecodeToFile({
          base64String: Buffer.from('x').toString('base64'),
        } as any)
      ).rejects.toThrow();
    });
  });

  describe('hashText', () => {
    it('computes a sha256 hex digest matching the crypto module directly', async () => {
      const result = await GroupCryptography.hashText({
        text: 'hello world',
        algorithm: 'sha256',
        encoding: 'hex',
      } as any);
      const expected = crypto.createHash('sha256').update('hello world').digest('hex');
      expect(result).toBe(expected);
    });

    it('computes a sha512 base64 digest', async () => {
      const result = await GroupCryptography.hashText({
        text: 'hello world',
        algorithm: 'sha512',
        encoding: 'base64',
      } as any);
      const expected = crypto.createHash('sha512').update('hello world').digest('base64');
      expect(result).toBe(expected);
    });

    it('throws a validation error for an unsupported algorithm', async () => {
      await expect(
        GroupCryptography.hashText({
          text: 'hello world',
          algorithm: 'md5',
          encoding: 'hex',
        } as any)
      ).rejects.toThrow();
    });
  });

  describe('hashFile', () => {
    it('computes the hash of a file on disk', async () => {
      const filePath = path.join(workDir, 'hash-me.txt');
      fs.writeFileSync(filePath, 'hash this content');

      const result = await GroupCryptography.hashFile({
        filePath,
        algorithm: 'sha256',
        encoding: 'hex',
      } as any);

      const expected = crypto.createHash('sha256').update('hash this content').digest('hex');
      expect(result).toBe(expected);
    });

    it('throws when the file does not exist', async () => {
      await expect(
        GroupCryptography.hashFile({
          filePath: path.join(workDir, 'missing.txt'),
          algorithm: 'sha256',
          encoding: 'hex',
        } as any)
      ).rejects.toThrow('File not found.');
    });
  });

  describe('hmacText', () => {
    it('computes an HMAC digest matching the crypto module directly', async () => {
      const result = await GroupCryptography.hmacText({
        text: 'hello world',
        algorithm: 'sha256',
        encoding: 'hex',
        key: 'secret-key',
      } as any);
      const expected = crypto.createHmac('sha256', 'secret-key').update('hello world').digest('hex');
      expect(result).toBe(expected);
    });

    it('throws a validation error when key is missing', async () => {
      await expect(
        GroupCryptography.hmacText({
          text: 'hello world',
          algorithm: 'sha256',
          encoding: 'hex',
        } as any)
      ).rejects.toThrow();
    });
  });

  describe('hmacFile', () => {
    it('computes an HMAC digest for a file on disk', async () => {
      const filePath = path.join(workDir, 'hmac-me.txt');
      fs.writeFileSync(filePath, 'hmac this content');

      const result = await GroupCryptography.hmacFile({
        filePath,
        algorithm: 'sha256',
        encoding: 'hex',
        key: 'secret-key',
      } as any);

      const expected = crypto
        .createHmac('sha256', 'secret-key')
        .update('hmac this content')
        .digest('hex');
      expect(result).toBe(expected);
    });

    it('throws when the file does not exist', async () => {
      await expect(
        GroupCryptography.hmacFile({
          filePath: path.join(workDir, 'missing.txt'),
          algorithm: 'sha256',
          encoding: 'hex',
          key: 'secret-key',
        } as any)
      ).rejects.toThrow('File not found.');
    });
  });

  describe('encryptText / decryptText', () => {
    const key = 'MySecretKey123456789012345678901'.slice(0, 32); // 32 bytes for aes-256-cbc
    const iv = '1234567890123456'; // 16 bytes

    it('round-trips a message through encryptText and decryptText', async () => {
      const encrypted = await GroupCryptography.encryptText({
        message: 'hello world',
        algorithm: 'aes-256-cbc',
        encoding: 'base64',
        iv,
        key,
      } as any);

      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe('hello world');

      const decrypted = await GroupCryptography.decryptText({
        encryptedMessage: encrypted,
        algorithm: 'aes-256-cbc',
        encoding: 'base64',
        iv,
        key,
      } as any);

      expect(decrypted).toBe('hello world');
    });

    it('produces hex output when encoding is hex', async () => {
      const encrypted = await GroupCryptography.encryptText({
        message: 'hex mode',
        algorithm: 'aes-256-cbc',
        encoding: 'hex',
        iv,
        key,
      } as any);
      expect(/^[0-9a-f]+$/i.test(encrypted)).toBe(true);
    });

    it('throws a validation error when the key length does not match the algorithm', async () => {
      await expect(
        GroupCryptography.encryptText({
          message: 'hello world',
          algorithm: 'aes-256-cbc',
          encoding: 'base64',
          iv,
          key: 'tooshortkey',
        } as any)
      ).rejects.toThrow();
    });

    it('throws a validation error when iv is not 16 bytes', async () => {
      await expect(
        GroupCryptography.encryptText({
          message: 'hello world',
          algorithm: 'aes-256-cbc',
          encoding: 'base64',
          iv: 'short',
          key,
        } as any)
      ).rejects.toThrow();
    });

    it('fails to decrypt when using the wrong key', async () => {
      const encrypted = await GroupCryptography.encryptText({
        message: 'hello world',
        algorithm: 'aes-256-cbc',
        encoding: 'base64',
        iv,
        key,
      } as any);

      const wrongKey = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ'.slice(0, 32);
      await expect(
        GroupCryptography.decryptText({
          encryptedMessage: encrypted,
          algorithm: 'aes-256-cbc',
          encoding: 'base64',
          iv,
          key: wrongKey,
        } as any)
      ).rejects.toThrow();
    });
  });

  describe('encryptToFile / decryptToFile', () => {
    const key = 'MySecretKey123456789012345678901'.slice(0, 32);
    const iv = '1234567890123456';

    it('round-trips a file through encryptToFile and decryptToFile', async () => {
      const inputPath = path.join(workDir, 'plain.txt');
      const encryptedPath = path.join(workDir, 'encrypted.txt');
      const decryptedPath = path.join(workDir, 'decrypted.txt');
      fs.writeFileSync(inputPath, 'plaintext file content');

      await GroupCryptography.encryptToFile({
        inputPath,
        outputPath: encryptedPath,
        algorithm: 'aes-256-cbc',
        encoding: 'base64',
        iv,
        key,
      } as any);

      expect(fs.existsSync(encryptedPath)).toBe(true);
      expect(fs.readFileSync(encryptedPath, 'utf8')).not.toBe('plaintext file content');

      await GroupCryptography.decryptToFile({
        inputPath: encryptedPath,
        outputPath: decryptedPath,
        algorithm: 'aes-256-cbc',
        encoding: 'base64',
        iv,
        key,
      } as any);

      expect(fs.readFileSync(decryptedPath, 'utf8')).toBe('plaintext file content');
    });

    it('throws a validation error when inputPath is missing', async () => {
      await expect(
        GroupCryptography.encryptToFile({
          outputPath: path.join(workDir, 'out.txt'),
          algorithm: 'aes-256-cbc',
          encoding: 'base64',
          iv,
          key,
        } as any)
      ).rejects.toThrow();
    });

    it('rejects when the input file for encryptToFile does not exist', async () => {
      await expect(
        GroupCryptography.encryptToFile({
          inputPath: path.join(workDir, 'missing.txt'),
          outputPath: path.join(workDir, 'out.txt'),
          algorithm: 'aes-256-cbc',
          encoding: 'base64',
          iv,
          key,
        } as any)
      ).rejects.toThrow();
    });
  });
});
