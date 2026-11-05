import crypto from 'crypto';
import fs from 'fs-extra';
import { z } from 'zod';

import { validations } from '@tipeline/schemas';

type Base64EncodeTextParams = z.infer<typeof validations.cryptography.base64EncodeText.runtime.schema>;
type Base64EncodeFileParams = z.infer<typeof validations.cryptography.base64EncodeFile.runtime.schema>;
type Base64DecodeTextParams = z.infer<typeof validations.cryptography.base64DecodeText.runtime.schema>;
type Base64DecodeToFileParams = z.infer<typeof validations.cryptography.base64DecodeToFile.runtime.schema>;
type HashTextParams = z.infer<typeof validations.cryptography.hashText.runtime.schema>;
type HashFileParams = z.infer<typeof validations.cryptography.hashFile.runtime.schema>;
type HmacTextParams = z.infer<typeof validations.cryptography.hmacText.runtime.schema>;
type HmacFileParams = z.infer<typeof validations.cryptography.hmacFile.runtime.schema>;
type EncryptTextParams = z.infer<typeof validations.cryptography.encryptText.runtime.schema>;
type DecryptTextParams = z.infer<typeof validations.cryptography.decryptText.runtime.schema>;
type EncryptToFileParams = z.infer<typeof validations.cryptography.encryptToFile.runtime.schema>;
type DecryptToFileParams = z.infer<typeof validations.cryptography.decryptToFile.runtime.schema>;

/**
 * @group Actions
 */
export class GroupCryptography {
  // --------------------------------------------------
  // Base64 Encode
  // --------------------------------------------------

  /**
   * Encodes a plain-text string to its Base64 representation.
   *
   * @param params - The input parameters.
   * @returns The Base64-encoded string.
   * @example
   * ```yaml
   * # Encode a message before embedding it in a data URI or HTTP header
   * - group: cryptography
   *   name: base64EncodeText
   *   params:
   *     text: 'hello world'
   * ```
   */
  static async base64EncodeText(params: Base64EncodeTextParams): Promise<string> {
    const parsed = validations.cryptography.base64EncodeText.runtime.validate(params);
    return Buffer.from(parsed.text, 'utf8').toString('base64');
  }

  /**
   * Reads a file from disk and returns its contents as a Base64-encoded string.
   *
   * @param params - The input parameters.
   * @returns The Base64-encoded file contents.
   * @example
   * ```yaml
   * # Encode a file so it can be embedded in a JSON payload or email attachment
   * - group: cryptography
   *   name: base64EncodeFile
   *   params:
   *     filePath: /path/to/file.txt
   * ```
   */
  static async base64EncodeFile(params: Base64EncodeFileParams): Promise<string> {
    const parsed = validations.cryptography.base64EncodeFile.runtime.validate(params);
    if (!fs.existsSync(parsed.filePath)) {
      throw new Error('File not found.');
    }

    const buffer = fs.readFileSync(parsed.filePath);
    return buffer.toString('base64');
  }

  // --------------------------------------------------
  // Base64 Decode
  // --------------------------------------------------

  /**
   * Decodes a Base64-encoded string back to plain text.
   *
   * @param params - The input parameters.
   * @returns The decoded UTF-8 string.
   * @example
   * ```yaml
   * # Decode a Base64 value received from an API response
   * - group: cryptography
   *   name: base64DecodeText
   *   params:
   *     base64String: 'aGVsbG8gd29ybGQ='
   * ```
   */
  static async base64DecodeText(params: Base64DecodeTextParams): Promise<string> {
    const parsed = validations.cryptography.base64DecodeText.runtime.validate(params);
    return Buffer.from(parsed.base64String, 'base64').toString('utf8');
  }

  /**
   * Decodes a Base64-encoded string and writes the raw bytes to a file.
   *
   * @param params - The input parameters.
   * @returns `true` when the file is written successfully.
   * @example
   * ```yaml
   * # Decode a Base64-encoded attachment and save it as a file
   * - group: cryptography
   *   name: base64DecodeToFile
   *   params:
   *     base64String: 'aGVsbG8gd29ybGQ='
   *     outputFilePath: /path/to/output.txt
   * ```
   */
  static async base64DecodeToFile(params: Base64DecodeToFileParams): Promise<boolean> {
    const parsed = validations.cryptography.base64DecodeToFile.runtime.validate(params);
    const buffer = Buffer.from(parsed.base64String, 'base64');
    fs.writeFileSync(parsed.outputFilePath, buffer);
    return true;
  }

  // --------------------------------------------------
  // Hash
  // --------------------------------------------------

  /**
   * Computes a cryptographic hash of a plain-text string.
   *
   * Supported algorithms: `sha256`, `sha384`, `sha512`.
   * Supported encodings: `hex`, `base64`, `binary`.
   *
   * @param params - The input parameters.
   * @returns The hash digest as a string in the requested encoding.
   * @example
   * ```yaml
   * # Fingerprint a task name with SHA-256 for use as a cache key
   * - group: cryptography
   *   name: hashText
   *   params:
   *     text: 'hello world'
   *     algorithm: sha256
   *     encoding: hex
   * ```
   */
  static async hashText(params: HashTextParams): Promise<string> {
    const parsed = validations.cryptography.hashText.runtime.validate(params);
    const { algorithm, text, encoding } = parsed;
    const hash = crypto.createHash(algorithm);
    hash.update(text);
    return hash.digest(encoding);
  }

  /**
   * Computes a cryptographic hash of a file's contents.
   *
   * Supported algorithms: `sha256`, `sha384`, `sha512`.
   * Supported encodings: `hex`, `base64`, `binary`.
   *
   * @param params - The input parameters.
   * @returns The hash digest as a string in the requested encoding.
   * @example
   * ```yaml
   * # Compute a SHA-512 fingerprint of a file to verify integrity after transfer
   * - group: cryptography
   *   name: hashFile
   *   params:
   *     filePath: /path/to/file.txt
   *     algorithm: sha512
   *     encoding: base64
   * ```
   */
  static async hashFile(params: HashFileParams): Promise<string> {
    const parsed = validations.cryptography.hashFile.runtime.validate(params);
    const { filePath, algorithm, encoding } = parsed;
    if (!fs.existsSync(filePath)) throw new Error('File not found.');
    const data = fs.readFileSync(filePath);
    const hash = crypto.createHash(algorithm);
    hash.update(data);
    return hash.digest(encoding);
  }

  // --------------------------------------------------
  // HMAC
  // --------------------------------------------------

  /**
   * Computes an HMAC signature for a plain-text string using a secret key.
   *
   * Supported algorithms: `sha256`, `sha384`, `sha512`.
   * Supported encodings: `hex`, `base64`, `binary`.
   *
   * @param params - The input parameters.
   * @returns The HMAC digest as a string in the requested encoding.
   * @example
   * ```yaml
   * # Sign a webhook payload before sending it to a third-party endpoint
   * - group: cryptography
   *   name: hmacText
   *   params:
   *     text: 'hello world'
   *     algorithm: sha256
   *     encoding: base64
   *     key: '{{ secret }}'
   * ```
   */
  static async hmacText(params: HmacTextParams): Promise<string> {
    const parsed = validations.cryptography.hmacText.runtime.validate(params);
    const { algorithm, text, encoding, key } = parsed;
    const hmac = crypto.createHmac(algorithm, key);
    hmac.update(text);
    return hmac.digest(encoding);
  }

  /**
   * Computes an HMAC signature for a file's contents using a secret key.
   *
   * Supported algorithms: `sha256`, `sha384`, `sha512`.
   * Supported encodings: `hex`, `base64`, `binary`.
   *
   * @param params - The input parameters.
   * @returns The HMAC digest as a string in the requested encoding.
   * @example
   * ```yaml
   * # Generate an HMAC to verify a file's authenticity before processing
   * - group: cryptography
   *   name: hmacFile
   *   params:
   *     filePath: /path/to/file.txt
   *     algorithm: sha512
   *     encoding: hex
   *     key: '{{ secret }}'
   * ```
   */
  static async hmacFile(params: HmacFileParams): Promise<string> {
    const parsed = validations.cryptography.hmacFile.runtime.validate(params);
    const { filePath, algorithm, encoding, key } = parsed;
    if (!fs.existsSync(filePath)) throw new Error('File not found.');
    const data = fs.readFileSync(filePath);
    const hmac = crypto.createHmac(algorithm, key);
    hmac.update(data);
    return hmac.digest(encoding);
  }

  // --------------------------------------------------
  // Encrypt / Decrypt (text)
  // --------------------------------------------------

  /**
   * Encrypts a plain-text string using AES-CBC and returns the ciphertext.
   *
   * The `key` length must match the algorithm — 16 bytes for `aes-128-cbc`,
   * 24 for `aes-192-cbc`, 32 for `aes-256-cbc`. The `iv` must always be 16 bytes.
   *
   * @param params - The input parameters.
   * @returns The encrypted string in the requested encoding (`base64` or `hex`).
   * @example
   * ```yaml
   * # Encrypt a sensitive value before storing it as a pipeline variable
   * - group: cryptography
   *   name: encryptText
   *   params:
   *     message: 'hello world'
   *     algorithm: aes-256-cbc
   *     encoding: base64
   *     iv: '1234567890123456'
   *     key: 'MySecretKey123456789012345678901'
   * ```
   */
  static async encryptText(params: EncryptTextParams): Promise<string> {
    const parsed = validations.cryptography.encryptText.runtime.validate(params);
    const { algorithm, message, encoding, iv, key } = parsed;
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(message, 'utf8', encoding);
    encrypted += cipher.final(encoding);
    return encrypted;
  }

  /**
   * Decrypts an AES-CBC ciphertext string and returns the plain text.
   *
   * The `key` and `iv` must match the values used during encryption exactly.
   *
   * @param params - The input parameters.
   * @returns The decrypted plain-text string.
   * @example
   * ```yaml
   * # Decrypt a stored ciphertext to recover the original value
   * - group: cryptography
   *   name: decryptText
   *   params:
   *     encryptedMessage: 'vuqe27zGld8nBuS8QOXvcA=='
   *     algorithm: aes-256-cbc
   *     encoding: base64
   *     iv: '1234567890123456'
   *     key: 'MySecretKey123456789012345678901'
   * ```
   */
  static async decryptText(params: DecryptTextParams): Promise<string> {
    const parsed = validations.cryptography.decryptText.runtime.validate(params);
    const { algorithm, encryptedMessage, encoding, iv, key } = parsed;
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encryptedMessage, encoding, 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  // --------------------------------------------------
  // Encrypt / Decrypt (file)
  // --------------------------------------------------

  /**
   * Reads a file, encrypts its contents with AES-CBC, and writes the ciphertext to an output file.
   *
   * @param params - The input parameters.
   * @returns `void` when the encrypted file is written successfully.
   * @example
   * ```yaml
   * # Encrypt a plaintext file before archiving or transferring it
   * - group: cryptography
   *   name: encryptToFile
   *   params:
   *     inputPath: /path/to/plaintext.txt
   *     outputPath: /path/to/encrypted.txt
   *     algorithm: aes-256-cbc
   *     encoding: base64
   *     iv: '1234567890123456'
   *     key: 'MySecretKey123456789012345678901'
   * ```
   */
  static async encryptToFile(params: EncryptToFileParams): Promise<void> {
    const parsed = validations.cryptography.encryptToFile.runtime.validate(params);
    const { algorithm, encoding, iv, key, inputPath, outputPath } = parsed;
    const message = await fs.readFile(inputPath, 'utf8');
    const encrypted = await GroupCryptography.encryptText({
      message,
      algorithm,
      encoding,
      iv,
      key,
    });
    await fs.writeFile(outputPath, encrypted, 'utf8');
  }

  /**
   * Reads an encrypted file, decrypts its contents with AES-CBC, and writes the plaintext to an output file.
   *
   * @param params - The input parameters.
   * @returns `void` when the decrypted file is written successfully.
   * @example
   * ```yaml
   * # Decrypt a previously encrypted file to restore the original contents
   * - group: cryptography
   *   name: decryptToFile
   *   params:
   *     inputPath: /path/to/encrypted.txt
   *     outputPath: /path/to/decrypted.txt
   *     algorithm: aes-256-cbc
   *     encoding: base64
   *     iv: '1234567890123456'
   *     key: 'MySecretKey123456789012345678901'
   * ```
   */
  static async decryptToFile(params: DecryptToFileParams): Promise<void> {
    const parsed = validations.cryptography.decryptToFile.runtime.validate(params);
    const { algorithm, encoding, iv, key, inputPath, outputPath } = parsed;
    const encryptedMessage = await fs.readFile(inputPath, 'utf8');
    const decrypted = await GroupCryptography.decryptText({
      encryptedMessage,
      algorithm,
      encoding,
      iv,
      key,
    });
    await fs.writeFile(outputPath, decrypted, 'utf8');
  }
}
