<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# OCR Actions

## General

### `recognize`

Extracts text and confidence score from an image using Tesseract OCR.

**Returns:** An object containing the extracted `text` and a `confidence` score from 0 to 100.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `source` | string | ✓ | — | File path or URL of the image or document to recognize. |
| `language` | string | ✓ | — | Language code for OCR recognition (e.g. "eng" for English). |

```yaml
# Extract text from a scanned invoice image
- group: ocr
  name: recognize
  params:
    source: '{{ imagePath }}'
    language: eng
```
