<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Folder Actions

## General

### `exists`

Checks whether a folder exists at the given path.

**Returns:** `true` if a directory exists at the path, otherwise `false`.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Path of the folder to check. |

```yaml
# Verify a target folder exists before writing files into it
- group: folder
  name: exists
  params:
    src: '{{ folderSrc }}'
```

## Inspect

### `getFiles`

Lists the entries in a folder (non-recursive). By default it returns bare names
(`photo.jpg`, not `/path/photo.jpg`) and includes subfolders.

**Returns:** An array of entry names, or full paths when `fullPaths` is true.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Path of the folder to list files from. |
| `fullPaths` | boolean |  | false | Return full paths (folder + name) instead of bare names. Defaults to false. |
| `extensions` | string[] |  | — | Only return files with one of these extensions, e.g. ["jpg", "png"]. Case-insensitive; subfolders are left out. |

```yaml
# List the photos in a folder as full paths, ready for image.load
- group: folder
  name: getFiles
  params:
    src: '{{ folderSrc }}'
    fullPaths: true
    extensions: [jpg, jpeg, png, heic]
```

### `getSubfolders`

Lists only the subdirectory names within a folder (non-recursive).

**Returns:** An array of subdirectory names.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Path of the folder to list subfolders from. |

```yaml
# Get all category subfolders inside the archive root
- group: folder
  name: getSubfolders
  params:
    src: '{{ folderSrc }}'
```

### `create`

Creates a folder at the given path, including any missing parent directories.

**Returns:** The path of the first directory created, or `undefined` if it already existed.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Path of the folder to create (parent directories created automatically). |

```yaml
# Create the output folder for a pipeline run (recursive)
- group: folder
  name: create
  params:
    src: '{{ folderNew }}'
```

## Create & Delete

### `delete`

Deletes a folder and all its contents.

**Returns:** `true` when the folder has been removed.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Path of the folder to delete. |

```yaml
# Remove the temporary working folder after a pipeline run completes
- group: folder
  name: delete
  params:
    src: '{{ folderNew }}'
```

### `empty`

Removes all contents of a folder without deleting the folder itself.

**Returns:** `true` when the folder has been emptied.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Path of the folder to empty (all contents deleted, folder remains). |

```yaml
# Clear the staging folder before writing a fresh batch of exports
- group: folder
  name: empty
  params:
    src: '{{ folderNew }}'
```

### `copy`

Copies a folder and all its contents to a new destination.

**Returns:** `true` when the copy is complete.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Source folder path to copy. |
| `dest` | string | ✓ | — | Destination path for the copied folder. |

```yaml
# Back up the current output folder before overwriting it
- group: folder
  name: copy
  params:
    src: '{{ folderNew }}'
    dest: '{{ folderCopy }}'
```

## Copy, Move & Rename

### `move`

Moves a folder to a new destination path.

**Returns:** `true` when the move is complete.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `src` | string | ✓ | — | Source folder path to move. |
| `dest` | string | ✓ | — | Destination path for the moved folder. |

```yaml
# Move the processed folder into the archive directory
- group: folder
  name: move
  params:
    src: '{{ folderCopy }}'
    dest: '{{ folderRenamed }}'
```

### `rename`

Renames a folder by providing the old and new path.

**Returns:** `true` when the rename is complete.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `oldPath` | string | ✓ | — | Current path of the folder. |
| `newPath` | string | ✓ | — | New path (name) for the folder. |

```yaml
# Rename the staging folder to reflect the completed pipeline run ID
- group: folder
  name: rename
  params:
    oldPath: '{{ folderNew }}'
    newPath: '{{ folderCopy }}'
```
