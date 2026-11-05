import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { orTemplateString } from './../templateValidation';

const encodingEnum = z.enum(['base64', 'hex', 'binary']);
const algorithmEnum = z.enum(['aes-128-cbc', 'aes-192-cbc', 'aes-256-cbc']); // extend as needed
const keyLengths: Record<z.infer<typeof algorithmEnum>, number> = {
  'aes-128-cbc': 16,
  'aes-192-cbc': 24,
  'aes-256-cbc': 32,
};

export const meta = {
  label: 'Cryptography',
  icon: 'Lock'
}

export const validations = {
  // --- Base64 ---
  base64EncodeText: createValidationPair(
    {
      runtime: z.object({ text: z.string().min(1) }),
      creation: z.object({ text: z.string().min(1) }),
    },
    {
      label: 'Base64 Encode (Text)', icon: '🧬', category: 'base64', description: 'Encode text to Base64.',
      returns: 'string',
      fieldConfig: {
        text: { description: 'The text string to encode as Base64.' },
      },
    }
  ),

  base64EncodeFile: createValidationPair(
    {
      runtime: z.object({ filePath: z.string().min(1) }),
      creation: z.object({ filePath: z.string().min(1) }),
    },
    {
      label: 'Base64 Encode (File)', icon: '🧬', category: 'base64', description: 'Encode file contents to Base64.',
      returns: 'string',
      fieldConfig: {
        filePath: { description: 'Path to the file whose contents will be Base64-encoded.' },
      },
    }
  ),

  base64DecodeText: createValidationPair(
    {
      runtime: z.object({ base64String: z.string().min(1) }),
      creation: z.object({ base64String: z.string().min(1) }),
    },
    {
      label: 'Base64 Decode (Text)', icon: '🧪', category: 'base64', description: 'Decode Base64 string to text.',
      returns: 'string',
      fieldConfig: {
        base64String: { description: 'The Base64-encoded string to decode.' },
      },
    }
  ),

  base64DecodeToFile: createValidationPair(
    {
      runtime: z.object({ base64String: z.string().min(1), outputFilePath: z.string().min(1) }),
      creation: z.object({ base64String: z.string().min(1), outputFilePath: z.string().min(1) }),
    },
    {
      label: 'Base64 Decode (File)', icon: '🧪', category: 'base64', description: 'Decode Base64 string into a file.',
      fieldConfig: {
        base64String: { description: 'The Base64-encoded string to decode.' },
        outputFilePath: { description: 'Path to write the decoded binary content to.' },
      },
    }
  ),

  // --- Hash ---
  hashText: createValidationPair(
    {
      runtime: z.object({
        text: z.string().min(1),
        algorithm: z.enum(['sha256', 'sha384', 'sha512']),
        encoding: encodingEnum,
      }),
      creation: z.object({
        text: z.string().min(1),
        algorithm: orTemplateString(z.enum(['sha256', 'sha384', 'sha512'])),
        encoding: orTemplateString(encodingEnum),
      }),
    },
    {
      label: 'Hash Text', icon: '🔗', category: 'hash', description: 'Hash text with SHA-2 algorithms.',
      returns: 'string',
      fieldConfig: {
        text: { description: 'The text to hash.' },
        algorithm: { description: 'Hashing algorithm to use: sha256, sha384, or sha512.' },
        encoding: { description: 'Output encoding: base64, hex, or binary.' },
      },
    }
  ),

  hashFile: createValidationPair(
    {
      runtime: z.object({
        filePath: z.string().min(1),
        algorithm: z.enum(['sha256', 'sha384', 'sha512']),
        encoding: encodingEnum,
      }),
      creation: z.object({
        filePath: z.string().min(1),
        algorithm: orTemplateString(z.enum(['sha256', 'sha384', 'sha512'])),
        encoding: orTemplateString(encodingEnum),
      }),
    },
    {
      label: 'Hash File', icon: '📁', category: 'hash', description: 'Hash a file with SHA-2 algorithms.',
      returns: 'string',
      fieldConfig: {
        filePath: { description: 'Path to the file to hash.' },
        algorithm: { description: 'Hashing algorithm to use: sha256, sha384, or sha512.' },
        encoding: { description: 'Output encoding: base64, hex, or binary.' },
      },
    }
  ),

  // --- HMAC ---
  hmacText: createValidationPair(
    {
      runtime: z.object({
        text: z.string().min(1),
        algorithm: z.enum(['sha256', 'sha384', 'sha512']),
        encoding: encodingEnum,
        key: z.string().min(1),
      }),
      creation: z.object({
        text: z.string().min(1),
        algorithm: orTemplateString(z.enum(['sha256', 'sha384', 'sha512'])),
        encoding: orTemplateString(encodingEnum),
        key: z.string().min(1),
      }),
    },
    {
      label: 'HMAC Text', icon: '🔑', category: 'hmac', description: 'Compute HMAC for text.',
      returns: 'string',
      fieldConfig: {
        text: { description: 'The text to compute HMAC for.' },
        algorithm: { description: 'HMAC algorithm to use: sha256, sha384, or sha512.' },
        encoding: { description: 'Output encoding: base64, hex, or binary.' },
        key: { description: 'Secret key for HMAC computation.' },
      },
    }
  ),

  hmacFile: createValidationPair(
    {
      runtime: z.object({
        filePath: z.string().min(1),
        algorithm: z.enum(['sha256', 'sha384', 'sha512']),
        encoding: encodingEnum,
        key: z.string().min(1),
      }),
      creation: z.object({
        filePath: z.string().min(1),
        algorithm: orTemplateString(z.enum(['sha256', 'sha384', 'sha512'])),
        encoding: orTemplateString(encodingEnum),
        key: z.string().min(1),
      }),
    },
    {
      label: 'HMAC File', icon: '🔑', category: 'hmac', description: 'Compute HMAC for a file.',
      returns: 'string',
      fieldConfig: {
        filePath: { description: 'Path to the file to compute HMAC for.' },
        algorithm: { description: 'HMAC algorithm to use: sha256, sha384, or sha512.' },
        encoding: { description: 'Output encoding: base64, hex, or binary.' },
        key: { description: 'Secret key for HMAC computation.' },
      },
    }
  ),

  // --- Crypto (text) ---
  encryptText: createValidationPair(
    {
      // Runtime schema is strict — variables have been substituted by this point.
      runtime: z
        .object({
          message: z.string(),
          algorithm: algorithmEnum,
          encoding: z.enum(['base64', 'hex']),
          iv: z.string().length(16, 'cryptography.iv.length16'),
          key: z.string(),
        })
        .superRefine((data, ctx) => {
          const expectedLength = keyLengths[data.algorithm];
          if (Buffer.from(data.key).length !== expectedLength) {
            ctx.addIssue({
              path: ['key'],
              code: z.ZodIssueCode.custom,
              message: `Key must be ${expectedLength} bytes for ${data.algorithm}`,
            });
          }
        }),
      // Creation schema is lenient — iv/key may be {{ variable }} template strings.
      creation: z.object({
        message: z.string(),
        algorithm: orTemplateString(algorithmEnum),
        encoding: orTemplateString(z.enum(['base64', 'hex'])),
        iv: z.string().min(1),
        key: z.string().min(1),
      }),
    },
    {
      label: 'Encrypt Text', icon: '🔒', category: 'crypto', description: 'AES-CBC encrypt a string.',
      returns: 'string',
      fieldConfig: {
        message: { description: 'The plaintext string to encrypt.' },
        algorithm: { description: 'AES cipher algorithm (aes-128-cbc, aes-192-cbc, aes-256-cbc).' },
        encoding: { description: 'Output encoding for the ciphertext: base64 or hex.' },
        iv: { description: 'Initialization vector — must be exactly 16 bytes.' },
        key: { description: 'Encryption key — length must match the chosen algorithm.' },
      },
    }
  ),

  decryptText: createValidationPair(
    {
      // Runtime schema is strict — variables have been substituted by this point.
      runtime: z
        .object({
          encryptedMessage: z.string(),
          algorithm: algorithmEnum,
          encoding: z.enum(['base64', 'hex']),
          iv: z.string().length(16, 'cryptography.iv.length16'),
          key: z.string(),
        })
        .superRefine((data, ctx) => {
          const expectedLength = keyLengths[data.algorithm];
          if (Buffer.from(data.key).length !== expectedLength) {
            ctx.addIssue({
              path: ['key'],
              code: z.ZodIssueCode.custom,
              message: `Key must be ${expectedLength} bytes for ${data.algorithm}`,
            });
          }
        }),
      // Creation schema is lenient — iv/key may be {{ variable }} template strings.
      creation: z.object({
        encryptedMessage: z.string(),
        algorithm: orTemplateString(algorithmEnum),
        encoding: orTemplateString(z.enum(['base64', 'hex'])),
        iv: z.string().min(1),
        key: z.string().min(1),
      }),
    },
    {
      label: 'Decrypt Text', icon: '🔓', category: 'crypto', description: 'AES-CBC decrypt a string.',
      returns: 'string',
      fieldConfig: {
        encryptedMessage: { description: 'The ciphertext string to decrypt.' },
        algorithm: { description: 'AES cipher algorithm (aes-128-cbc, aes-192-cbc, aes-256-cbc).' },
        encoding: { description: 'Encoding of the ciphertext input: base64 or hex.' },
        iv: { description: 'Initialization vector — must be exactly 16 bytes.' },
        key: { description: 'Decryption key — length must match the chosen algorithm.' },
      },
    }
  ),

  // --- Crypto (file streams) ---
  encryptToFile: createValidationPair(
    {
      runtime: z.object({
        algorithm: algorithmEnum,
        encoding: z.enum(['base64', 'hex']),
        iv: z.string().min(1, 'cryptography.iv.required'),
        key: z.string().min(1, 'cryptography.key.required'),
        inputPath: z.string().min(1, 'cryptography.inputPath.required'),
        outputPath: z.string().min(1, 'cryptography.outputPath.required'),
      }),
      creation: z.object({
        algorithm: orTemplateString(algorithmEnum),
        encoding: orTemplateString(z.enum(['base64', 'hex'])),
        iv: z.string().min(1, 'cryptography.iv.required'),
        key: z.string().min(1, 'cryptography.key.required'),
        inputPath: z.string().min(1, 'cryptography.inputPath.required'),
        outputPath: z.string().min(1, 'cryptography.outputPath.required'),
      }),
    },
    {
      label: 'Encrypt to File', icon: '📦🔒', category: 'crypto', description: 'Encrypt a file and write output.',
      fieldConfig: {
        algorithm: { description: 'AES cipher algorithm (aes-128-cbc, aes-192-cbc, aes-256-cbc).' },
        encoding: { description: 'Output encoding for the encrypted file: base64 or hex.' },
        iv: { description: 'Initialization vector (non-empty string).' },
        key: { description: 'Encryption key — length must match the chosen algorithm.' },
        inputPath: { description: 'Path to the source file to encrypt.' },
        outputPath: { description: 'Path where the encrypted output file will be written.' },
      },
    }
  ),

  decryptToFile: createValidationPair(
    {
      runtime: z.object({
        algorithm: algorithmEnum,
        encoding: z.enum(['base64', 'hex']),
        iv: z.string().min(1, 'cryptography.iv.requiredShort'),
        key: z.string().min(1, 'cryptography.key.requiredShort'),
        inputPath: z.string().min(1, 'cryptography.inputPath.requiredShort'),
        outputPath: z.string().min(1, 'cryptography.outputPath.requiredShort'),
      }),
      creation: z.object({
        algorithm: orTemplateString(algorithmEnum),
        encoding: orTemplateString(z.enum(['base64', 'hex'])),
        iv: z.string().min(1, 'cryptography.iv.requiredShort'),
        key: z.string().min(1, 'cryptography.key.requiredShort'),
        inputPath: z.string().min(1, 'cryptography.inputPath.requiredShort'),
        outputPath: z.string().min(1, 'cryptography.outputPath.requiredShort'),
      }),
    },
    {
      label: 'Decrypt to File', icon: '📦🔓', category: 'crypto', description: 'Decrypt a file and write output.',
      fieldConfig: {
        algorithm: { description: 'AES cipher algorithm (aes-128-cbc, aes-192-cbc, aes-256-cbc).' },
        encoding: { description: 'Encoding of the encrypted input file: base64 or hex.' },
        iv: { description: 'Initialization vector (non-empty string).' },
        key: { description: 'Decryption key — length must match the chosen algorithm.' },
        inputPath: { description: 'Path to the encrypted source file.' },
        outputPath: { description: 'Path where the decrypted output file will be written.' },
      },
    }
  ),
};
