<!-- AUTO-GENERATED: Do not edit manually. Run `npm run generate` to regenerate. -->

# Spreadsheet Actions

## General

### `open`

Opens an existing spreadsheet and returns a workbook object.

**Returns:** The parsed workbook object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | Path to the spreadsheet file to open. |

```yaml
# Open a spreadsheet and store it as a workbook variable for subsequent actions
- group: spreadsheet
  name: open
  params:
    path: '{{ spreadsheetPath }}'
  destination: workbook
```

## File-level Actions

### `create`

Creates a new empty spreadsheet file with a single sheet named "Sheet1".

**Returns:** The newly created workbook object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | Path where the new spreadsheet file will be created. |

```yaml
# Create a blank spreadsheet at the given path
- group: spreadsheet
  name: create
  params:
    path: '{{ spreadsheetPath }}'
  destination: workbook
```

### `save`

Writes the in-memory workbook to disk, overwriting the file at the given path.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | Destination path to save the workbook. |
| `workbook` | any | ✓ | — | The workbook object to save. |

```yaml
# Save all pending changes back to the original file
- group: spreadsheet
  name: save
  params:
    workbook: '{= workbook =}'
    path: '{{ spreadsheetPath }}'
```

### `delete`

Deletes a spreadsheet file from disk.

**Returns:** `true` on success.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | Path to the spreadsheet file to delete. |

```yaml
# Remove a temporary report spreadsheet after processing
- group: spreadsheet
  name: delete
  params:
    path: '{{ spreadsheetPath }}'
```

### `getSheetNames`

Returns an array of all sheet names in the workbook.

**Returns:** Array of sheet name strings.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object to list sheets from. |

```yaml
# Retrieve sheet names to decide which sheet to process
- group: spreadsheet
  name: getSheetNames
  params:
    workbook: '{= workbook =}'
```

## Sheet Management

### `addSheet`

Adds a new empty sheet to the workbook.

**Returns:** The updated workbook object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object to add a sheet to. |
| `name` | string | ✓ | — | Name for the new sheet. |

```yaml
# Add a "Summary" sheet to hold aggregated results
- group: spreadsheet
  name: addSheet
  params:
    workbook: '{= workbook =}'
    name: Summary
  destination: workbook
```

### `deleteSheet`

Removes a sheet from the workbook by name.

**Returns:** The updated workbook object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object to remove a sheet from. |
| `name` | string | ✓ | — | Name of the sheet to delete. |

```yaml
# Drop the temporary staging sheet after merging its data
- group: spreadsheet
  name: deleteSheet
  params:
    workbook: '{= workbook =}'
    name: Staging
  destination: workbook
```

### `renameSheet`

Renames an existing sheet in the workbook.

**Returns:** The updated workbook object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object containing the sheet. |
| `name` | string | ✓ | — | Current name of the sheet to rename. |
| `newName` | string | ✓ | — | New name for the sheet. |

```yaml
# Rename "Sheet1" to a more descriptive name after populating it
- group: spreadsheet
  name: renameSheet
  params:
    workbook: '{= workbook =}'
    name: Sheet1
    newName: Sales Q1
  destination: workbook
```

### `toJson`

Converts a sheet to an array of row objects keyed by the first-row headers.

Equivalent to reading the entire sheet and zipping header names to values.
Returns an empty array if the sheet has no data.

**Returns:** Array of `{ [header]: value }` objects, one per data row.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet to convert. |

```yaml
# Extract all rows from the "Orders" sheet as JSON for downstream processing
- group: spreadsheet
  name: toJson
  params:
    workbook: '{= workbook =}'
    sheet: Orders
```

### `toArray`

Converts a sheet to a 2D array, including the header row.

Returns an empty array if the sheet has no data.

**Returns:** 2D array where each inner array is a row of raw values.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet to convert. |

```yaml
# Read the full sheet as a 2D array for manual iteration or comparison
- group: spreadsheet
  name: toArray
  params:
    workbook: '{= workbook =}'
    sheet: Orders
```

### `appendRow`

Appends a new row after the last used row in the sheet.

Safe to call on an empty sheet. Cell types are inferred automatically.

**Returns:** The updated workbook object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet. |
| `values` | any[] | ✓ | — | Array of values to append as a new row. |

```yaml
# Add a new data row to the bottom of the sheet
- group: spreadsheet
  name: appendRow
  params:
    workbook: '{= workbook =}'
    sheet: '{{ sheetName }}'
    values: [Bob, 25, false]
  destination: workbook
```

## Row Operations

### `getRowCount`

Returns the number of used rows in a sheet.

**Returns:** Row count, or `0` if the sheet is empty.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet to count rows in. |

```yaml
# Get the row count to drive a loop over all data rows
- group: spreadsheet
  name: getRowCount
  params:
    workbook: '{= workbook =}'
    sheet: '{{ sheetName }}'
```

### `readCell`

Reads a cell value by its zero-based row and column indices.

**Returns:** The cell value, or `null` if empty.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet. |
| `row` | number | ✓ | — | Zero-based row index. |
| `col` | number | ✓ | — | Zero-based column index. |

```yaml
# Read the value at row 1, column 2
- group: spreadsheet
  name: readCell
  params:
    workbook: '{= workbook =}'
    sheet: '{{ sheetName }}'
    row: 1
    col: 2
```

### `writeCell`

Writes a single value to a cell by its zero-based row and column indices.

Cell type is inferred automatically.

**Returns:** The updated workbook object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet. |
| `row` | number | ✓ | — | Zero-based row index. |
| `col` | number | ✓ | — | Zero-based column index. |
| `value` | any | ✓ | — | Value to write to the cell. |

```yaml
# Update the status cell at row 3, column 1
- group: spreadsheet
  name: writeCell
  params:
    workbook: '{= workbook =}'
    sheet: '{{ sheetName }}'
    row: 3
    col: 1
    value: completed
  destination: workbook
```

### `clearCell`

Deletes the value from a cell by its zero-based row and column indices.

**Returns:** The updated workbook object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet. |
| `row` | number | ✓ | — | Zero-based row index. |
| `col` | number | ✓ | — | Zero-based column index. |

```yaml
# Clear the cell at row 0, column 3 before writing new headers
- group: spreadsheet
  name: clearCell
  params:
    workbook: '{= workbook =}'
    sheet: '{{ sheetName }}'
    row: 0
    col: 3
  destination: workbook
```

### `getCellAddress`

Converts a zero-based row/col index pair to an A1-style cell reference string.

Useful for building cell references dynamically before passing them to other actions.

**Returns:** The A1-style reference (e.g. `"C4"`).

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `row` | number | ✓ | — | Zero-based row index. |
| `col` | number | ✓ | — | Zero-based column index. |

```yaml
# Convert computed row/col indices to a cell reference for setCellFormula
- group: spreadsheet
  name: getCellAddress
  params:
    row: 3
    col: 2
```

### `readCellByRef`

Reads a cell value by its A1-style reference (e.g. `"B3"`).

Use this when the reference is already known or comes from `getCellAddress`.

**Returns:** The cell value, or `null` if empty.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet. |
| `cellRef` | string | ✓ | — | A1-style cell reference (e.g. "B3"). |

```yaml
# Read the value at cell B3 by reference
- group: spreadsheet
  name: readCellByRef
  params:
    workbook: '{= workbook =}'
    sheet: '{{ sheetName }}'
    cellRef: B3
```

### `setCellFormula`

Writes a formula to a cell by its A1-style reference.

The formula string should not include the leading `=`.

**Returns:** The updated workbook object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet. |
| `cellRef` | string | ✓ | — | A1-style cell reference to write the formula to (e.g. "C5"). |
| `formula` | string | ✓ | — | Spreadsheet formula to write (e.g. "=SUM(A1:A10)"). |

```yaml
# Sum column A rows 1–10 and place the result in A11
- group: spreadsheet
  name: setCellFormula
  params:
    workbook: '{= workbook =}'
    sheet: '{{ sheetName }}'
    cellRef: A11
    formula: 'SUM(A1:A10)'
  destination: workbook
```

### `readRange`

Reads all cell values in a rectangular range as a 2D array.

Formula cells return their formula string prefixed with `=`.

**Returns:** 2D array of values; inner arrays are rows.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet. |
| `startCell` | string | ✓ | — | Top-left cell of the range (A1-style, e.g. "A1"). |
| `endCell` | string | ✓ | — | Bottom-right cell of the range (A1-style, e.g. "D10"). |

```yaml
# Read the data block A1:D10 for processing
- group: spreadsheet
  name: readRange
  params:
    workbook: '{= workbook =}'
    sheet: '{{ sheetName }}'
    startCell: A1
    endCell: D10
```

## Range Operations

### `writeRange`

Writes a 2D array of values into the sheet starting from a cell reference.

Cell types are inferred automatically. The write area is determined by the
dimensions of the `values` array, not by an explicit end cell.

**Returns:** The updated workbook object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet. |
| `startCell` | string | ✓ | — | Top-left cell to begin writing from (A1-style). |
| `values` | any[][] | ✓ | — | 2D array of values to write (rows × columns). |

```yaml
# Write a header row and two data rows starting at A1
- group: spreadsheet
  name: writeRange
  params:
    workbook: '{= workbook =}'
    sheet: '{{ sheetName }}'
    startCell: A1
    values:
      - [Name, Age, Active]
      - [Alice, 30, true]
      - [Bob, 25, false]
  destination: workbook
```

### `clearRange`

Deletes all cell values in a rectangular range.

**Returns:** The updated workbook object.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet. |
| `startCell` | string | ✓ | — | Top-left cell of the range to clear (A1-style). |
| `endCell` | string | ✓ | — | Bottom-right cell of the range to clear (A1-style). |

```yaml
# Wipe the A1:C5 block before writing fresh data
- group: spreadsheet
  name: clearRange
  params:
    workbook: '{= workbook =}'
    sheet: '{{ sheetName }}'
    startCell: A1
    endCell: C5
  destination: workbook
```

### `getUsedRange`

Returns the A1:XN reference string for the sheet's used range.

**Returns:** The used range string (e.g. `"A1:D10"`), or `null` if the sheet is empty.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `workbook` | any | ✓ | — | The workbook object. |
| `sheet` | string | ✓ | — | Name of the sheet to get the used range for. |

```yaml
# Get the used range to drive a readRange action dynamically
- group: spreadsheet
  name: getUsedRange
  params:
    workbook: '{= workbook =}'
    sheet: '{{ sheetName }}'
```

### `getSpreadsheetInfo`

Returns file-system metadata for a spreadsheet: size, creation time, and last-modified time.

**Returns:** Object with `size` (bytes), `createdAt`, and `modifiedAt` timestamps.

| Parameter | Type | Required | Default | Description |
|-----------|------|:--------:|---------|-------------|
| `path` | string | ✓ | — | Path to the spreadsheet file to get info for. |

```yaml
# Check the spreadsheet modification date before deciding whether to process it
- group: spreadsheet
  name: getSpreadsheetInfo
  params:
    path: '{{ spreadsheetPath }}'
```
