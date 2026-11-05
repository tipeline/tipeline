<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Cryptography Actions

## General

### `base64EncodeText`

Encodes a plain-text string to its Base64 representation.

**Returns:** The Base64-encoded string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `text` | string | ✓ | — | The text string to encode as Base64. |

```yaml
# Encode a message before embedding it in a data URI or HTTP header
- group: cryptography
  name: base64EncodeText
  params:
    text: 'hello world'
```

## Base64 Encode

### `base64EncodeFile`

Reads a file from disk and returns its contents as a Base64-encoded string.

**Returns:** The Base64-encoded file contents.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `filePath` | string | ✓ | — | Path to the file whose contents will be Base64-encoded. |

```yaml
# Encode a file so it can be embedded in a JSON payload or email attachment
- group: cryptography
  name: base64EncodeFile
  params:
    filePath: /path/to/file.txt
```

### `base64DecodeText`

Decodes a Base64-encoded string back to plain text.

**Returns:** The decoded UTF-8 string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `base64String` | string | ✓ | — | The Base64-encoded string to decode. |

```yaml
# Decode a Base64 value received from an API response
- group: cryptography
  name: base64DecodeText
  params:
    base64String: 'aGVsbG8gd29ybGQ='
```

## Base64 Decode

### `base64DecodeToFile`

Decodes a Base64-encoded string and writes the raw bytes to a file.

**Returns:** `true` when the file is written successfully.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `base64String` | string | ✓ | — | The Base64-encoded string to decode. |
| `outputFilePath` | string | ✓ | — | Path to write the decoded binary content to. |

```yaml
# Decode a Base64-encoded attachment and save it as a file
- group: cryptography
  name: base64DecodeToFile
  params:
    base64String: 'aGVsbG8gd29ybGQ='
    outputFilePath: /path/to/output.txt
```

### `hashText`

Computes a cryptographic hash of a plain-text string.

Supported algorithms: `sha256`, `sha384`, `sha512`.
Supported encodings: `hex`, `base64`, `binary`.

**Returns:** The hash digest as a string in the requested encoding.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `text` | string | ✓ | — | The text to hash. |
| `algorithm` | `sha256` \| `sha384` \| `sha512` | ✓ | — | Hashing algorithm to use: sha256, sha384, or sha512. |
| `encoding` | `base64` \| `hex` \| `binary` | ✓ | — | Output encoding: base64, hex, or binary. |

```yaml
# Fingerprint a task name with SHA-256 for use as a cache key
- group: cryptography
  name: hashText
  params:
    text: 'hello world'
    algorithm: sha256
    encoding: hex
```

## Hash

### `hashFile`

Computes a cryptographic hash of a file's contents.

Supported algorithms: `sha256`, `sha384`, `sha512`.
Supported encodings: `hex`, `base64`, `binary`.

**Returns:** The hash digest as a string in the requested encoding.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `filePath` | string | ✓ | — | Path to the file to hash. |
| `algorithm` | `sha256` \| `sha384` \| `sha512` | ✓ | — | Hashing algorithm to use: sha256, sha384, or sha512. |
| `encoding` | `base64` \| `hex` \| `binary` | ✓ | — | Output encoding: base64, hex, or binary. |

```yaml
# Compute a SHA-512 fingerprint of a file to verify integrity after transfer
- group: cryptography
  name: hashFile
  params:
    filePath: /path/to/file.txt
    algorithm: sha512
    encoding: base64
```

### `hmacText`

Computes an HMAC signature for a plain-text string using a secret key.

Supported algorithms: `sha256`, `sha384`, `sha512`.
Supported encodings: `hex`, `base64`, `binary`.

**Returns:** The HMAC digest as a string in the requested encoding.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `text` | string | ✓ | — | The text to compute HMAC for. |
| `algorithm` | `sha256` \| `sha384` \| `sha512` | ✓ | — | HMAC algorithm to use: sha256, sha384, or sha512. |
| `encoding` | `base64` \| `hex` \| `binary` | ✓ | — | Output encoding: base64, hex, or binary. |
| `key` | string | ✓ | — | Secret key for HMAC computation. |

```yaml
# Sign a webhook payload before sending it to a third-party endpoint
- group: cryptography
  name: hmacText
  params:
    text: 'hello world'
    algorithm: sha256
    encoding: base64
    key: '{{ secret }}'
```

## HMAC

### `hmacFile`

Computes an HMAC signature for a file's contents using a secret key.

Supported algorithms: `sha256`, `sha384`, `sha512`.
Supported encodings: `hex`, `base64`, `binary`.

**Returns:** The HMAC digest as a string in the requested encoding.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `filePath` | string | ✓ | — | Path to the file to compute HMAC for. |
| `algorithm` | `sha256` \| `sha384` \| `sha512` | ✓ | — | HMAC algorithm to use: sha256, sha384, or sha512. |
| `encoding` | `base64` \| `hex` \| `binary` | ✓ | — | Output encoding: base64, hex, or binary. |
| `key` | string | ✓ | — | Secret key for HMAC computation. |

```yaml
# Generate an HMAC to verify a file's authenticity before processing
- group: cryptography
  name: hmacFile
  params:
    filePath: /path/to/file.txt
    algorithm: sha512
    encoding: hex
    key: '{{ secret }}'
```

### `encryptText`

Encrypts a plain-text string using AES-CBC and returns the ciphertext.

The `key` length must match the algorithm — 16 bytes for `aes-128-cbc`,
24 for `aes-192-cbc`, 32 for `aes-256-cbc`. The `iv` must always be 16 bytes.

**Returns:** The encrypted string in the requested encoding (`base64` or `hex`).

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `message` | string | ✓ | — | The plaintext string to encrypt. |
| `algorithm` | `aes-128-cbc` \| `aes-192-cbc` \| `aes-256-cbc` | ✓ | — | AES cipher algorithm (aes-128-cbc, aes-192-cbc, aes-256-cbc). |
| `encoding` | `base64` \| `hex` | ✓ | — | Output encoding for the ciphertext: base64 or hex. |
| `iv` | string | ✓ | — | Initialization vector — must be exactly 16 bytes. |
| `key` | string | ✓ | — | Encryption key — length must match the chosen algorithm. |

```yaml
# Encrypt a sensitive value before storing it as a pipeline variable
- group: cryptography
  name: encryptText
  params:
    message: 'hello world'
    algorithm: aes-256-cbc
    encoding: base64
    iv: '1234567890123456'
    key: 'MySecretKey123456789012345678901'
```

## Encrypt / Decrypt (text)

### `decryptText`

Decrypts an AES-CBC ciphertext string and returns the plain text.

The `key` and `iv` must match the values used during encryption exactly.

**Returns:** The decrypted plain-text string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `encryptedMessage` | string | ✓ | — | The ciphertext string to decrypt. |
| `algorithm` | `aes-128-cbc` \| `aes-192-cbc` \| `aes-256-cbc` | ✓ | — | AES cipher algorithm (aes-128-cbc, aes-192-cbc, aes-256-cbc). |
| `encoding` | `base64` \| `hex` | ✓ | — | Encoding of the ciphertext input: base64 or hex. |
| `iv` | string | ✓ | — | Initialization vector — must be exactly 16 bytes. |
| `key` | string | ✓ | — | Decryption key — length must match the chosen algorithm. |

```yaml
# Decrypt a stored ciphertext to recover the original value
- group: cryptography
  name: decryptText
  params:
    encryptedMessage: 'vuqe27zGld8nBuS8QOXvcA=='
    algorithm: aes-256-cbc
    encoding: base64
    iv: '1234567890123456'
    key: 'MySecretKey123456789012345678901'
```

### `encryptToFile`

Reads a file, encrypts its contents with AES-CBC, and writes the ciphertext to an output file.

**Returns:** `void` when the encrypted file is written successfully.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `algorithm` | `aes-128-cbc` \| `aes-192-cbc` \| `aes-256-cbc` | ✓ | — | AES cipher algorithm (aes-128-cbc, aes-192-cbc, aes-256-cbc). |
| `encoding` | `base64` \| `hex` | ✓ | — | Output encoding for the encrypted file: base64 or hex. |
| `iv` | string | ✓ | — | Initialization vector (non-empty string). |
| `key` | string | ✓ | — | Encryption key — length must match the chosen algorithm. |
| `inputPath` | string | ✓ | — | Path to the source file to encrypt. |
| `outputPath` | string | ✓ | — | Path where the encrypted output file will be written. |

```yaml
# Encrypt a plaintext file before archiving or transferring it
- group: cryptography
  name: encryptToFile
  params:
    inputPath: /path/to/plaintext.txt
    outputPath: /path/to/encrypted.txt
    algorithm: aes-256-cbc
    encoding: base64
    iv: '1234567890123456'
    key: 'MySecretKey123456789012345678901'
```

## Encrypt / Decrypt (file)

### `decryptToFile`

Reads an encrypted file, decrypts its contents with AES-CBC, and writes the plaintext to an output file.

**Returns:** `void` when the decrypted file is written successfully.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `algorithm` | `aes-128-cbc` \| `aes-192-cbc` \| `aes-256-cbc` | ✓ | — | AES cipher algorithm (aes-128-cbc, aes-192-cbc, aes-256-cbc). |
| `encoding` | `base64` \| `hex` | ✓ | — | Encoding of the encrypted input file: base64 or hex. |
| `iv` | string | ✓ | — | Initialization vector (non-empty string). |
| `key` | string | ✓ | — | Decryption key — length must match the chosen algorithm. |
| `inputPath` | string | ✓ | — | Path to the encrypted source file. |
| `outputPath` | string | ✓ | — | Path where the decrypted output file will be written. |

```yaml
# Decrypt a previously encrypted file to restore the original contents
- group: cryptography
  name: decryptToFile
  params:
    inputPath: /path/to/encrypted.txt
    outputPath: /path/to/decrypted.txt
    algorithm: aes-256-cbc
    encoding: base64
    iv: '1234567890123456'
    key: 'MySecretKey123456789012345678901'
```
