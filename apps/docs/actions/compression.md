<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Compression Actions

## General

### `archive`

Creates an archive from one or more files, directories, or glob patterns.

Supports `zip`, `tar`, and `tar.gz` formats. Sources that don't exist at
runtime cause the promise to reject immediately.

**Returns:** `true` when the archive is written and closed successfully.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | Destination path for the output archive file. |
| `sources` | string[] | ✓ | — | List of file paths, directories, or globs to include in the archive. |
| `level` | number |  | — | Compression level (0 = no compression, 9 = maximum). |
| `format` | `zip` \| `tar` \| `tar.gz` | ✓ | — | Archive format: zip, tar, or tar.gz. |
| `password` | string |  | — | Optional password to protect the archive (not yet implemented). |

```yaml
# Archive a folder and all YAML files in the actions directory as a tar.gz
- group: compression
  name: archive
  params:
    path: /path/to/output/archive.tar.gz
    sources:
      - /path/to/folder
      - /path/to/actions/*.yml
    level: 7
    format: tar.gz
```

### `unarchive`

Extracts an archive to a destination directory.

Supports `.zip`, `.tar`, and `.tar.gz` formats. The destination directory
is created automatically if it does not exist.

**Returns:** `true` when extraction completes successfully.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | Path to the archive file to extract. |
| `destination` | string | ✓ | — | Directory where extracted files will be placed. |
| `password` | string |  | — | Optional password to decrypt the archive (not yet implemented). |

```yaml
# Extract a tar.gz archive into a dedicated output folder
- group: compression
  name: unarchive
  params:
    path: /path/to/archive.tar.gz
    destination: /path/to/output/
```
