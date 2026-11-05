import fs from 'fs';
import * as XLSX from 'xlsx-republish';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';

type OpenParams = z.infer<typeof validations.spreadsheet.open.runtime.schema>;
type CreateParams = z.infer<typeof validations.spreadsheet.create.runtime.schema>;
type SaveParams = z.infer<typeof validations.spreadsheet.save.runtime.schema>;
type DeleteParams = z.infer<typeof validations.spreadsheet.delete.runtime.schema>;
type GetSheetNamesParams = z.infer<typeof validations.spreadsheet.getSheetNames.runtime.schema>;
type AddSheetParams = z.infer<typeof validations.spreadsheet.addSheet.runtime.schema>;
type DeleteSheetParams = z.infer<typeof validations.spreadsheet.deleteSheet.runtime.schema>;
type RenameSheetParams = z.infer<typeof validations.spreadsheet.renameSheet.runtime.schema>;
type ToJsonParams = z.infer<typeof validations.spreadsheet.toJson.runtime.schema>;
type ToArrayParams = z.infer<typeof validations.spreadsheet.toArray.runtime.schema>;
type AppendRowParams = z.infer<typeof validations.spreadsheet.appendRow.runtime.schema>;
type GetRowCountParams = z.infer<typeof validations.spreadsheet.getRowCount.runtime.schema>;
type ReadCellParams = z.infer<typeof validations.spreadsheet.readCell.runtime.schema>;
type WriteCellParams = z.infer<typeof validations.spreadsheet.writeCell.runtime.schema>;
type ClearCellParams = z.infer<typeof validations.spreadsheet.clearCell.runtime.schema>;
type GetCellAddressParams = z.infer<typeof validations.spreadsheet.getCellAddress.runtime.schema>;
type ReadCellByRefParams = z.infer<typeof validations.spreadsheet.readCellByRef.runtime.schema>;
type SetCellFormulaParams = z.infer<typeof validations.spreadsheet.setCellFormula.runtime.schema>;
type ReadRangeParams = z.infer<typeof validations.spreadsheet.readRange.runtime.schema>;
type WriteRangeParams = z.infer<typeof validations.spreadsheet.writeRange.runtime.schema>;
type ClearRangeParams = z.infer<typeof validations.spreadsheet.clearRange.runtime.schema>;
type GetUsedRangeParams = z.infer<typeof validations.spreadsheet.getUsedRange.runtime.schema>;
type GetSpreadsheetInfoParams = z.infer<typeof validations.spreadsheet.getSpreadsheetInfo.runtime.schema>;

/**
 * @group Actions
 */
export class GroupSpreadsheet {
  // --------------------------------------------------
  // File-level Actions
  // --------------------------------------------------

  /**
   * Opens an existing spreadsheet and returns a workbook object.
   *
   * @param params - The input parameters.
   * @returns The parsed workbook object.
   * @example
   * ```yaml
   * # Open a spreadsheet and store it as a workbook variable for subsequent actions
   * - group: spreadsheet
   *   name: open
   *   params:
   *     path: '{{ spreadsheetPath }}'
   *   destination: workbook
   * ```
   */
  static async open(params: OpenParams): Promise<any> {
    const { path } = validations.spreadsheet.open.runtime.validate(params);
    return XLSX.read(fs.readFileSync(path), { type: 'buffer' });
  }

  /**
   * Creates a new empty spreadsheet file with a single sheet named "Sheet1".
   *
   * @param params - The input parameters.
   * @returns The newly created workbook object.
   * @example
   * ```yaml
   * # Create a blank spreadsheet at the given path
   * - group: spreadsheet
   *   name: create
   *   params:
   *     path: '{{ spreadsheetPath }}'
   *   destination: workbook
   * ```
   */
  static async create(params: CreateParams): Promise<any> {
    const { path } = validations.spreadsheet.create.runtime.validate(params);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    fs.writeFileSync(path, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    return wb;
  }

  /**
   * Writes the in-memory workbook to disk, overwriting the file at the given path.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Save all pending changes back to the original file
   * - group: spreadsheet
   *   name: save
   *   params:
   *     workbook: '{= workbook =}'
   *     path: '{{ spreadsheetPath }}'
   * ```
   */
  static async save(params: SaveParams): Promise<boolean> {
    const { path, workbook } = validations.spreadsheet.save.runtime.validate(params);
    fs.writeFileSync(path, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    return true;
  }

  /**
   * Deletes a spreadsheet file from disk.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Remove a temporary report spreadsheet after processing
   * - group: spreadsheet
   *   name: delete
   *   params:
   *     path: '{{ spreadsheetPath }}'
   * ```
   */
  static async delete(params: DeleteParams): Promise<boolean> {
    const { path } = validations.spreadsheet.delete.runtime.validate(params);
    fs.unlinkSync(path);
    return true;
  }

  // --------------------------------------------------
  // Sheet Management
  // --------------------------------------------------

  /**
   * Returns an array of all sheet names in the workbook.
   *
   * @param params - The input parameters.
   * @returns Array of sheet name strings.
   * @example
   * ```yaml
   * # Retrieve sheet names to decide which sheet to process
   * - group: spreadsheet
   *   name: getSheetNames
   *   params:
   *     workbook: '{= workbook =}'
   * ```
   */
  static async getSheetNames(params: GetSheetNamesParams): Promise<string[]> {
    const { workbook } = validations.spreadsheet.getSheetNames.runtime.validate(params);
    return workbook.SheetNames;
  }

  /**
   * Adds a new empty sheet to the workbook.
   *
   * @param params - The input parameters.
   * @returns The updated workbook object.
   * @example
   * ```yaml
   * # Add a "Summary" sheet to hold aggregated results
   * - group: spreadsheet
   *   name: addSheet
   *   params:
   *     workbook: '{= workbook =}'
   *     name: Summary
   *   destination: workbook
   * ```
   */
  static async addSheet(params: AddSheetParams): Promise<any> {
    const { workbook, name } = validations.spreadsheet.addSheet.runtime.validate(params);
    const ws = XLSX.utils.aoa_to_sheet([[]]);
    XLSX.utils.book_append_sheet(workbook, ws, name);
    return workbook;
  }

  /**
   * Removes a sheet from the workbook by name.
   *
   * @param params - The input parameters.
   * @returns The updated workbook object.
   * @example
   * ```yaml
   * # Drop the temporary staging sheet after merging its data
   * - group: spreadsheet
   *   name: deleteSheet
   *   params:
   *     workbook: '{= workbook =}'
   *     name: Staging
   *   destination: workbook
   * ```
   */
  static async deleteSheet(params: DeleteSheetParams): Promise<any> {
    const { workbook, name } = validations.spreadsheet.deleteSheet.runtime.validate(params);
    const index = workbook.SheetNames.indexOf(name);
    if (index === -1) throw new Error(`Sheet '${name}' not found`);
    workbook.SheetNames.splice(index, 1);
    delete workbook.Sheets[name];
    return workbook;
  }

  /**
   * Renames an existing sheet in the workbook.
   *
   * @param params - The input parameters.
   * @returns The updated workbook object.
   * @example
   * ```yaml
   * # Rename "Sheet1" to a more descriptive name after populating it
   * - group: spreadsheet
   *   name: renameSheet
   *   params:
   *     workbook: '{= workbook =}'
   *     name: Sheet1
   *     newName: Sales Q1
   *   destination: workbook
   * ```
   */
  static async renameSheet(params: RenameSheetParams): Promise<any> {
    const { workbook, name, newName } = validations.spreadsheet.renameSheet.runtime.validate(params);
    const index = workbook.SheetNames.indexOf(name);
    if (index === -1) throw new Error(`Sheet '${name}' not found`);
    workbook.SheetNames[index] = newName;
    workbook.Sheets[newName] = workbook.Sheets[name];
    delete workbook.Sheets[name];
    return workbook;
  }

  /**
   * Converts a sheet to an array of row objects keyed by the first-row headers.
   *
   * Equivalent to reading the entire sheet and zipping header names to values.
   * Returns an empty array if the sheet has no data.
   *
   * @param params - The input parameters.
   * @returns Array of `{ [header]: value }` objects, one per data row.
   * @example
   * ```yaml
   * # Extract all rows from the "Orders" sheet as JSON for downstream processing
   * - group: spreadsheet
   *   name: toJson
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: Orders
   * ```
   */
  static async toJson(params: ToJsonParams): Promise<Record<string, any>[]> {
    const { workbook, sheet } = validations.spreadsheet.toJson.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    if (!ws || !ws['!ref']) return [];
    return XLSX.utils.sheet_to_json(ws);
  }

  /**
   * Converts a sheet to a 2D array, including the header row.
   *
   * Returns an empty array if the sheet has no data.
   *
   * @param params - The input parameters.
   * @returns 2D array where each inner array is a row of raw values.
   * @example
   * ```yaml
   * # Read the full sheet as a 2D array for manual iteration or comparison
   * - group: spreadsheet
   *   name: toArray
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: Orders
   * ```
   */
  static async toArray(params: ToArrayParams): Promise<any[][]> {
    const { workbook, sheet } = validations.spreadsheet.toArray.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    if (!ws || !ws['!ref']) return [];
    return XLSX.utils.sheet_to_json(ws, { header: 1 });
  }

  // --------------------------------------------------
  // Row Operations
  // --------------------------------------------------

  /**
   * Appends a new row after the last used row in the sheet.
   *
   * Safe to call on an empty sheet. Cell types are inferred automatically.
   *
   * @param params - The input parameters.
   * @returns The updated workbook object.
   * @example
   * ```yaml
   * # Add a new data row to the bottom of the sheet
   * - group: spreadsheet
   *   name: appendRow
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: '{{ sheetName }}'
   *     values: [Bob, 25, false]
   *   destination: workbook
   * ```
   */
  static async appendRow(params: AppendRowParams): Promise<any> {
    const { workbook, sheet, values } = validations.spreadsheet.appendRow.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    if (!ws) throw new Error(`Sheet "${sheet}" not found`);
    const row = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).e.r + 1 : 0;
    for (let c = 0; c < values.length; ++c) {
      ws[XLSX.utils.encode_cell({ r: row, c })] = GroupSpreadsheet.inferCell(values[c]);
    }
    GroupSpreadsheet.updateSheetRef(ws, row, values.length - 1);
    return workbook;
  }

  /**
   * Returns the number of used rows in a sheet.
   *
   * @param params - The input parameters.
   * @returns Row count, or `0` if the sheet is empty.
   * @example
   * ```yaml
   * # Get the row count to drive a loop over all data rows
   * - group: spreadsheet
   *   name: getRowCount
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: '{{ sheetName }}'
   * ```
   */
  static async getRowCount(params: GetRowCountParams): Promise<number> {
    const { workbook, sheet } = validations.spreadsheet.getRowCount.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    if (!ws || !ws['!ref']) return 0;
    const range = XLSX.utils.decode_range(ws['!ref']);
    return range.e.r - range.s.r + 1;
  }

  // Cell Operations
  // --------------------------------------------------

  /**
   * Reads a cell value by its zero-based row and column indices.
   *
   * @param params - The input parameters.
   * @returns The cell value, or `null` if empty.
   * @example
   * ```yaml
   * # Read the value at row 1, column 2
   * - group: spreadsheet
   *   name: readCell
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: '{{ sheetName }}'
   *     row: 1
   *     col: 2
   * ```
   */
  static async readCell(params: ReadCellParams): Promise<any> {
    const { workbook, sheet, row, col } = validations.spreadsheet.readCell.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    return ws[XLSX.utils.encode_cell({ r: row, c: col })]?.v ?? null;
  }

  /**
   * Writes a single value to a cell by its zero-based row and column indices.
   *
   * Cell type is inferred automatically.
   *
   * @param params - The input parameters.
   * @returns The updated workbook object.
   * @example
   * ```yaml
   * # Update the status cell at row 3, column 1
   * - group: spreadsheet
   *   name: writeCell
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: '{{ sheetName }}'
   *     row: 3
   *     col: 1
   *     value: completed
   *   destination: workbook
   * ```
   */
  static async writeCell(params: WriteCellParams): Promise<any> {
    const { workbook, sheet, row, col, value } = validations.spreadsheet.writeCell.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    ws[XLSX.utils.encode_cell({ r: row, c: col })] = GroupSpreadsheet.inferCell(value);
    GroupSpreadsheet.updateSheetRef(ws, row, col);
    return workbook;
  }

  /**
   * Deletes the value from a cell by its zero-based row and column indices.
   *
   * @param params - The input parameters.
   * @returns The updated workbook object.
   * @example
   * ```yaml
   * # Clear the cell at row 0, column 3 before writing new headers
   * - group: spreadsheet
   *   name: clearCell
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: '{{ sheetName }}'
   *     row: 0
   *     col: 3
   *   destination: workbook
   * ```
   */
  static async clearCell(params: ClearCellParams): Promise<any> {
    const { workbook, sheet, row, col } = validations.spreadsheet.clearCell.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    delete ws[XLSX.utils.encode_cell({ r: row, c: col })];
    return workbook;
  }

  /**
   * Converts a zero-based row/col index pair to an A1-style cell reference string.
   *
   * Useful for building cell references dynamically before passing them to other actions.
   *
   * @param params - The input parameters.
   * @returns The A1-style reference (e.g. `"C4"`).
   * @example
   * ```yaml
   * # Convert computed row/col indices to a cell reference for setCellFormula
   * - group: spreadsheet
   *   name: getCellAddress
   *   params:
   *     row: 3
   *     col: 2
   * ```
   */
  static async getCellAddress(params: GetCellAddressParams): Promise<string> {
    const { row, col } = validations.spreadsheet.getCellAddress.runtime.validate(params);
    return XLSX.utils.encode_cell({ r: row, c: col });
  }

  /**
   * Reads a cell value by its A1-style reference (e.g. `"B3"`).
   *
   * Use this when the reference is already known or comes from `getCellAddress`.
   *
   * @param params - The input parameters.
   * @returns The cell value, or `null` if empty.
   * @example
   * ```yaml
   * # Read the value at cell B3 by reference
   * - group: spreadsheet
   *   name: readCellByRef
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: '{{ sheetName }}'
   *     cellRef: B3
   * ```
   */
  static async readCellByRef(params: ReadCellByRefParams): Promise<any> {
    const { workbook, sheet, cellRef } = validations.spreadsheet.readCellByRef.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    return ws[cellRef]?.v ?? null;
  }

  /**
   * Writes a formula to a cell by its A1-style reference.
   *
   * The formula string should not include the leading `=`.
   *
   * @param params - The input parameters.
   * @returns The updated workbook object.
   * @example
   * ```yaml
   * # Sum column A rows 1–10 and place the result in A11
   * - group: spreadsheet
   *   name: setCellFormula
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: '{{ sheetName }}'
   *     cellRef: A11
   *     formula: 'SUM(A1:A10)'
   *   destination: workbook
   * ```
   */
  static async setCellFormula(params: SetCellFormulaParams): Promise<any> {
    const { workbook, sheet, cellRef, formula } = validations.spreadsheet.setCellFormula.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    if (!ws) throw new Error(`Sheet "${sheet}" not found`);
    ws[cellRef] = { t: 'n', f: formula };
    const { r: row, c: col } = XLSX.utils.decode_cell(cellRef);
    GroupSpreadsheet.updateSheetRef(ws, row, col);
    return workbook;
  }

  // --------------------------------------------------
  // Range Operations
  // --------------------------------------------------

  /**
   * Reads all cell values in a rectangular range as a 2D array.
   *
   * Formula cells return their formula string prefixed with `=`.
   *
   * @param params - The input parameters.
   * @returns 2D array of values; inner arrays are rows.
   * @example
   * ```yaml
   * # Read the data block A1:D10 for processing
   * - group: spreadsheet
   *   name: readRange
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: '{{ sheetName }}'
   *     startCell: A1
   *     endCell: D10
   * ```
   */
  static async readRange(params: ReadRangeParams): Promise<any[][]> {
    const { workbook, sheet, startCell, endCell } = validations.spreadsheet.readRange.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    const range = {
      s: XLSX.utils.decode_cell(startCell),
      e: XLSX.utils.decode_cell(endCell),
    };
    const data: any[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: any[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = XLSX.utils.encode_cell({ r, c });
        row.push(ws[cell]?.v ?? (ws[cell]?.f ? `=${ws[cell].f}` : null));
      }
      data.push(row);
    }
    return data;
  }

  /**
   * Writes a 2D array of values into the sheet starting from a cell reference.
   *
   * Cell types are inferred automatically. The write area is determined by the
   * dimensions of the `values` array, not by an explicit end cell.
   *
   * @param params - The input parameters.
   * @returns The updated workbook object.
   * @example
   * ```yaml
   * # Write a header row and two data rows starting at A1
   * - group: spreadsheet
   *   name: writeRange
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: '{{ sheetName }}'
   *     startCell: A1
   *     values:
   *       - [Name, Age, Active]
   *       - [Alice, 30, true]
   *       - [Bob, 25, false]
   *   destination: workbook
   * ```
   */
  static async writeRange(params: WriteRangeParams): Promise<any> {
    const { workbook, sheet, startCell, values } = validations.spreadsheet.writeRange.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    const start = XLSX.utils.decode_cell(startCell);
    for (let r = 0; r < values.length; r++) {
      for (let c = 0; c < values[r].length; c++) {
        const cell = XLSX.utils.encode_cell({ r: start.r + r, c: start.c + c });
        ws[cell] = GroupSpreadsheet.inferCell(values[r][c]);
      }
    }
    GroupSpreadsheet.updateSheetRef(ws, start.r + values.length - 1, start.c + values[0].length - 1);
    return workbook;
  }

  /**
   * Deletes all cell values in a rectangular range.
   *
   * @param params - The input parameters.
   * @returns The updated workbook object.
   * @example
   * ```yaml
   * # Wipe the A1:C5 block before writing fresh data
   * - group: spreadsheet
   *   name: clearRange
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: '{{ sheetName }}'
   *     startCell: A1
   *     endCell: C5
   *   destination: workbook
   * ```
   */
  static async clearRange(params: ClearRangeParams): Promise<any> {
    const { workbook, sheet, startCell, endCell } = validations.spreadsheet.clearRange.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    const range = {
      s: XLSX.utils.decode_cell(startCell),
      e: XLSX.utils.decode_cell(endCell),
    };
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        delete ws[XLSX.utils.encode_cell({ r, c })];
      }
    }
    return workbook;
  }

  /**
   * Returns the A1:XN reference string for the sheet's used range.
   *
   * @param params - The input parameters.
   * @returns The used range string (e.g. `"A1:D10"`), or `null` if the sheet is empty.
   * @example
   * ```yaml
   * # Get the used range to drive a readRange action dynamically
   * - group: spreadsheet
   *   name: getUsedRange
   *   params:
   *     workbook: '{= workbook =}'
   *     sheet: '{{ sheetName }}'
   * ```
   */
  static async getUsedRange(params: GetUsedRangeParams): Promise<string | null> {
    const { workbook, sheet } = validations.spreadsheet.getUsedRange.runtime.validate(params);
    const ws = workbook.Sheets[sheet];
    return ws['!ref'] ?? null;
  }

  // --------------------------------------------------
  // Metadata
  // --------------------------------------------------

  /**
   * Returns file-system metadata for a spreadsheet: size, creation time, and last-modified time.
   *
   * @param params - The input parameters.
   * @returns Object with `size` (bytes), `createdAt`, and `modifiedAt` timestamps.
   * @example
   * ```yaml
   * # Check the spreadsheet modification date before deciding whether to process it
   * - group: spreadsheet
   *   name: getSpreadsheetInfo
   *   params:
   *     path: '{{ spreadsheetPath }}'
   * ```
   */
  static async getSpreadsheetInfo(params: GetSpreadsheetInfoParams): Promise<{
    size: number;
    createdAt: Date;
    modifiedAt: Date;
  }> {
    const { path } = validations.spreadsheet.getSpreadsheetInfo.runtime.validate(params);
    const stats = fs.statSync(path);
    return {
      size: stats.size,
      createdAt: stats.birthtime,
      modifiedAt: stats.mtime,
    };
  }

  // --------------------------------------------------
  // Private helpers
  // --------------------------------------------------

  private static inferCell(value: any): { t: string; v: any } {
    if (value === null || value === undefined) return { t: 'z', v: undefined };
    if (typeof value === 'number') return { t: 'n', v: value };
    if (typeof value === 'boolean') return { t: 'b', v: value };
    return { t: 's', v: String(value) };
  }

  private static updateSheetRef(ws: XLSX.WorkSheet, row: number, col: number) {
    const range = XLSX.utils.decode_range(
      ws['!ref'] ||
        XLSX.utils.encode_range({
          s: { r: 0, c: 0 },
          e: { r: row, c: col },
        })
    );
    range.s.r = Math.min(range.s.r, row);
    range.s.c = Math.min(range.s.c, col);
    range.e.r = Math.max(range.e.r, row);
    range.e.c = Math.max(range.e.c, col);
    ws['!ref'] = XLSX.utils.encode_range(range);
  }
}
