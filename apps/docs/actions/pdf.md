<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# PDF Actions

## General

### `extractText`

Extracts all text content from a PDF file, merging all pages into a single string.

**Returns:** The full text extracted from the PDF as a single string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | Path to the PDF file to extract text from. |

```yaml
# Extract text from a scanned invoice PDF
- group: pdf
  name: extractText
  params:
    path: '{{ pdfPath }}'
```

### `extractImage`

Extracts all images from the first page of a PDF and saves them as PNG files.

**Returns:** An array of file paths to the saved PNG images.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | Path to the PDF file to extract images from. |
| `output` | string | ✓ | — | Directory path where extracted images will be saved. |

```yaml
# Extract images from a PDF page and save them to a folder
- group: pdf
  name: extractImage
  params:
    path: '{{ pdfPath }}'
    output: '{{ outputFolder }}'
```

### `merge`

Merges multiple PDF files into a single output PDF.

**Returns:** The file path to the merged PDF.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `input` | string[] | ✓ | — | List of PDF file paths to merge in order. |
| `output` | string | ✓ | — | Destination path for the merged PDF. |

```yaml
# Merge a list of report PDFs into one consolidated file
- group: pdf
  name: merge
  params:
    input: '{= pdfFiles =}'
    output: '{{ mergedOutput }}'
```

### `getPageCount`

Returns the total number of pages in a PDF file.

**Returns:** The page count as a number.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | Path to the PDF file to count pages in. |

```yaml
# Get page count — useful for conditional branching on multi-page documents
- group: pdf
  name: getPageCount
  params:
    path: '{{ pdfPath }}'
```

### `splitPages`

Splits a PDF into one file per page, saving each to an output directory.

**Returns:** An array of file paths for each extracted page PDF.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | Path to the PDF file to split. |
| `output` | string | ✓ | — | Directory path where the per-page PDF files will be saved. |
| `prefix` | string |  | — | Optional filename prefix for the output files (e.g. "page" → page1.pdf). |

```yaml
# Split an invoice bundle into individual page files
- group: pdf
  name: splitPages
  params:
    path: '{{ pdfPath }}'
    output: '{{ splitOutput }}'
    prefix: invoice
```
