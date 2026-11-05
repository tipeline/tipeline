<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# File Actions

## General

### `fileExists`

Checks whether a file or directory exists at the given path.

**Returns:** `true` if the path exists, otherwise throws.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | File or directory path to check for existence. |

```yaml
# Verify the daily report exists before downstream actions attempt to read it
- group: file
  name: fileExists
  params:
    src: '{{ reportFile }}'
```

## Existence

### `copy`

Copies a file or directory to a new location.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Source file or directory path to copy. |
| `dest` | string | ✓ | — | Destination path for the copy. |

```yaml
# Back up the report before processing — preserves the original in case of failure
- group: file
  name: copy
  params:
    src: '{{ reportFile }}'
    dest: '{{ backupFile }}'
```

## Copy & Move

### `move`

Moves a file or directory to a new location.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Source file or directory path to move. |
| `dest` | string | ✓ | — | Destination path (including new filename if renaming). |

```yaml
# Move the backup to the archive directory after processing is complete
- group: file
  name: move
  params:
    src: '{{ backupFile }}'
    dest: '{{ archivedFile }}'
```

### `rename`

Renames a file or directory.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `oldPath` | string | ✓ | — | Current path of the file or directory. |
| `newPath` | string | ✓ | — | New path (name) for the file or directory. |

```yaml
# Rename the archived file to include the pipeline name for traceability
- group: file
  name: rename
  params:
    oldPath: '{{ archivedFile }}'
    newPath: '{{ renamedFile }}'
```

### `remove`

Deletes a file or directory.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Path of the file or directory to delete. |

```yaml
# Clean up the renamed archive after processing — keeps the working directory tidy
- group: file
  name: remove
  params:
    src: '{{ renamedFile }}'
```

### `read`

Reads the content of a file as a UTF-8 string.

**Returns:** The file content as a string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Path of the file to read. |

```yaml
# Read the daily report content to pass downstream to an email or notification action
- group: file
  name: read
  params:
    src: '{{ reportFile }}'
```

## Read & Write

### `write`

Writes text to a file, creating parent directories if needed.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Destination path for the file to write. |
| `data` | string | ✓ | — | Text content to write to the file. |

```yaml
# Write a pipeline summary to a log file after execution completes
- group: file
  name: write
  params:
    src: '/tmp/tipeline/logs/pipeline-summary.txt'
    data: 'Pipeline completed successfully. Report: daily-report.txt'
```

### `readCSV`

Parses a CSV file into an array of row objects.

**Returns:** An array of parsed row objects.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Path to the CSV file to read. |
| `options` | object | ✓ | — | CSV parsing options (columns, delimiter, trim, skip empty lines). |

```yaml
# Parse an invoice CSV into rows for downstream processing or filtering
- group: file
  name: readCSV
  params:
    src: '{{ csvInput }}'
    options:
      columns: true
      skip_empty_lines: true
      delimiter: ','
      trim: true
```

## CSV

### `writeCSV`

Writes an array of row objects to a CSV file, creating parent directories if needed.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Destination path for the CSV file. |
| `rows` | Record&lt;string, any&gt;[] | ✓ | — | Array of record objects to write as CSV rows. |

```yaml
# Write processed invoice rows back to a CSV for export or archiving
- group: file
  name: writeCSV
  params:
    src: '{{ csvOutput }}'
    rows:
      - invoice: 'INV-001'
        client: 'Acme Corp'
        amount: 4200
      - invoice: 'INV-002'
        client: 'Globex'
        amount: 8750
```

### `getFilePathPart`

Extracts a specific portion of a file path (dirname, basename, extname, filename, or root).

**Returns:** The requested path segment as a string.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | The file path to extract a part from. |
| `part` | `dirname` \| `basename` \| `extname` \| `filename` \| `root` | ✓ | — | Part to extract: dirname, basename, extname, filename, or root. |

```yaml
# Extract the directory from a report path — useful for creating sibling files
- group: file
  name: getFilePathPart
  params:
    src: '{{ reportFile }}'
    part: dirname
```

## Path

### `convertFileToBase64`

Reads a file and returns its content encoded as a Base64 string.

**Returns:** The Base64-encoded file content.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Path of the file to encode as Base64. |

```yaml
# Encode the report file to Base64 — useful when attaching it to an HTTP or email payload
- group: file
  name: convertFileToBase64
  params:
    src: '{{ reportFile }}'
  destination: base64Data
```

## Base64

### `convertBase64ToFile`

Decodes a Base64 string and writes the result to a file, creating parent directories if needed.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `dest` | string | ✓ | — | Destination path to write the decoded file content. |
| `base64` | string | ✓ | — | The Base64-encoded string to decode and write. |

```yaml
# Decode a Base64 attachment and write it to disk for further processing
- group: file
  name: convertBase64ToFile
  params:
    dest: '/tmp/tipeline/reports/decoded-report.txt'
    base64: '{{ base64Data }}'
```
