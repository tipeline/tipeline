<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# QR Code Actions

## General

### `generate`

Generates a QR code image from a text string and saves it to disk.

**Returns:** `true` when the file has been written successfully.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `text` | string | ✓ | — | Text or URL to encode in the QR code. |
| `path` | string | ✓ | — | Output file path to save the generated QR code image. |

```yaml
# Generate a QR code from a URL and save it to the output directory
- group: qrcode
  name: generate
  params:
    text: 'https://tipeline.io/tasks/send-daily-report'
    path: '{{ outputPath }}'
```

## Generate

### `read`

Decodes and returns the text encoded in a QR code image.

**Returns:** The decoded string content of the QR code.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | File path of the QR code image to decode. |

```yaml
# Read the QR code from a scanned document and capture its decoded value
- group: qrcode
  name: read
  params:
    path: '{{ qrCodePath }}'
```
