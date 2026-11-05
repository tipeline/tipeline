import { z } from 'zod';
import { createValidationPair } from './../createValidation';

const pathReq = () => z.string().min(1);
const sheetStr = () => z.string();
const workbookAny = () => z.any();
const zeroIdx = () => z.number().min(0);

export const meta = {
  label: 'Spreadsheet',
  icon: 'Sheet',
};

export const validations = {
  // --------------------------------------------------
  // File-level Actions
  // --------------------------------------------------
  open: createValidationPair(
    {
      runtime: z.object({ path: pathReq() }),
      creation: z.object({ path: pathReq() }),
    },
    {
      label: 'Open', icon: '📂', category: 'spreadsheet', description: 'Open an existing spreadsheet file.',
      returns: 'workbook',
      fieldConfig: { path: { description: 'Path to the spreadsheet file to open.' } },
    }
  ),

  create: createValidationPair(
    {
      runtime: z.object({ path: pathReq() }),
      creation: z.object({ path: pathReq() }),
    },
    {
      label: 'Create', icon: '🆕', category: 'spreadsheet', description: 'Create a new spreadsheet file.',
      returns: 'workbook',
      fieldConfig: { path: { description: 'Path where the new spreadsheet file will be created.' } },
    }
  ),

  save: createValidationPair(
    {
      runtime: z.object({ path: pathReq(), workbook: workbookAny() }),
      creation: z.object({ path: pathReq(), workbook: workbookAny() }),
    },
    {
      label: 'Save', icon: '💾', category: 'spreadsheet', description: 'Save workbook to disk.',
      returns: 'boolean',
      fieldConfig: {
        path: { description: 'Destination path to save the workbook.' },
        workbook: { description: 'The workbook object to save.' },
      },
    }
  ),

  delete: createValidationPair(
    {
      runtime: z.object({ path: pathReq() }),
      creation: z.object({ path: pathReq() }),
    },
    {
      label: 'Delete', icon: '🗑️', category: 'spreadsheet', description: 'Delete a spreadsheet file.',
      returns: 'boolean',
      fieldConfig: { path: { description: 'Path to the spreadsheet file to delete.' } },
    }
  ),

  // --------------------------------------------------
  // Sheet Management
  // --------------------------------------------------
  getSheetNames: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny() }),
      creation: z.object({ workbook: workbookAny() }),
    },
    {
      label: 'Get Sheet Names', icon: '🗂️', category: 'sheet', description: 'List all sheets in the workbook.',
      returns: 'array',
      fieldConfig: { workbook: { description: 'The workbook object to list sheets from.' } },
    }
  ),

  addSheet: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny(), name: z.string().min(1) }),
      creation: z.object({ workbook: workbookAny(), name: z.string().min(1) }),
    },
    {
      label: 'Add Sheet', icon: '➕', category: 'sheet', description: 'Add a new sheet by name.',
      returns: 'workbook',
      fieldConfig: {
        workbook: { description: 'The workbook object to add a sheet to.' },
        name: { description: 'Name for the new sheet.' },
      },
    }
  ),

  deleteSheet: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny(), name: z.string().min(1) }),
      creation: z.object({ workbook: workbookAny(), name: z.string().min(1) }),
    },
    {
      label: 'Delete Sheet', icon: '➖', category: 'sheet', description: 'Remove a sheet by name.',
      returns: 'workbook',
      fieldConfig: {
        workbook: { description: 'The workbook object to remove a sheet from.' },
        name: { description: 'Name of the sheet to delete.' },
      },
    }
  ),

  renameSheet: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny(), name: z.string().min(1), newName: z.string().min(1) }),
      creation: z.object({ workbook: workbookAny(), name: z.string().min(1), newName: z.string().min(1) }),
    },
    {
      label: 'Rename Sheet', icon: '✏️', category: 'sheet', description: 'Rename a sheet.',
      returns: 'workbook',
      fieldConfig: {
        workbook: { description: 'The workbook object containing the sheet.' },
        name: { description: 'Current name of the sheet to rename.' },
        newName: { description: 'New name for the sheet.' },
      },
    }
  ),

  toJson: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny(), sheet: sheetStr() }),
      creation: z.object({ workbook: workbookAny(), sheet: sheetStr() }),
    },
    {
      label: 'To JSON', icon: '{}', category: 'sheet', description: 'Convert sheet to an array of row objects keyed by the first-row headers.',
      returns: 'array',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet to convert.' },
      },
    }
  ),

  toArray: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny(), sheet: sheetStr() }),
      creation: z.object({ workbook: workbookAny(), sheet: sheetStr() }),
    },
    {
      label: 'To Array', icon: '[]', category: 'sheet', description: 'Convert sheet to a 2D array including the header row.',
      returns: 'array',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet to convert.' },
      },
    }
  ),

  // --------------------------------------------------
  // Row Operations
  // --------------------------------------------------
  appendRow: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny(), sheet: sheetStr(), values: z.array(z.any()) }),
      creation: z.object({ workbook: workbookAny(), sheet: sheetStr(), values: z.array(z.any()) }),
    },
    {
      label: 'Append Row', icon: '➕', category: 'row', description: 'Append a new row after the last used row.',
      returns: 'workbook',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet.' },
        values: { description: 'Array of values to append as a new row.' },
      },
    }
  ),

  getRowCount: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny(), sheet: sheetStr() }),
      creation: z.object({ workbook: workbookAny(), sheet: sheetStr() }),
    },
    {
      label: 'Row Count', icon: '#️⃣', category: 'row', description: 'Return the number of used rows in a sheet.',
      returns: 'number',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet to count rows in.' },
      },
    }
  ),

  // --------------------------------------------------
  // Cell Operations
  // --------------------------------------------------
  readCell: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny(), sheet: sheetStr(), row: zeroIdx(), col: zeroIdx() }),
      creation: z.object({ workbook: workbookAny(), sheet: sheetStr(), row: zeroIdx(), col: zeroIdx() }),
    },
    {
      label: 'Read Cell', icon: '🔍', category: 'cell', description: 'Read a cell value by row and column index.',
      returns: 'any',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet.' },
        row: { description: 'Zero-based row index.' },
        col: { description: 'Zero-based column index.' },
      },
    }
  ),

  writeCell: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny(), sheet: sheetStr(), row: zeroIdx(), col: zeroIdx(), value: z.any() }),
      creation: z.object({ workbook: workbookAny(), sheet: sheetStr(), row: zeroIdx(), col: zeroIdx(), value: z.any() }),
    },
    {
      label: 'Write Cell', icon: '✍️', category: 'cell', description: 'Write a value to a cell by row and column index.',
      returns: 'workbook',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet.' },
        row: { description: 'Zero-based row index.' },
        col: { description: 'Zero-based column index.' },
        value: { description: 'Value to write to the cell.' },
      },
    }
  ),

  clearCell: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny(), sheet: sheetStr(), row: zeroIdx(), col: zeroIdx() }),
      creation: z.object({ workbook: workbookAny(), sheet: sheetStr(), row: zeroIdx(), col: zeroIdx() }),
    },
    {
      label: 'Clear Cell', icon: '🧹', category: 'cell', description: 'Delete the value from a cell by row and column index.',
      returns: 'workbook',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet.' },
        row: { description: 'Zero-based row index.' },
        col: { description: 'Zero-based column index.' },
      },
    }
  ),

  getCellAddress: createValidationPair(
    {
      runtime: z.object({ row: zeroIdx(), col: zeroIdx() }),
      creation: z.object({ row: zeroIdx(), col: zeroIdx() }),
    },
    {
      label: 'Cell Address', icon: '🏷️', category: 'cell', description: 'Convert a row/col index pair to an A1-style cell reference.',
      returns: 'string',
      fieldConfig: {
        row: { description: 'Zero-based row index.' },
        col: { description: 'Zero-based column index.' },
      },
    }
  ),

  readCellByRef: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny(), sheet: sheetStr(), cellRef: z.string().min(1) }),
      creation: z.object({ workbook: workbookAny(), sheet: sheetStr(), cellRef: z.string().min(1) }),
    },
    {
      label: 'Read Cell by Ref', icon: '🔎', category: 'cell', description: 'Read a cell value by A1-style reference (e.g. "B3").',
      returns: 'any',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet.' },
        cellRef: { description: 'A1-style cell reference (e.g. "B3").' },
      },
    }
  ),

  setCellFormula: createValidationPair(
    {
      runtime: z.object({
        workbook: workbookAny(),
        sheet: sheetStr(),
        cellRef: z.string().min(1),
        formula: z.string().min(1),
      }),
      creation: z.object({
        workbook: workbookAny(),
        sheet: sheetStr(),
        cellRef: z.string().min(1),
        formula: z.string().min(1),
      }),
    },
    {
      label: 'Set Formula', icon: '🧮', category: 'cell', description: 'Write a formula to a cell by A1-style reference.',
      returns: 'workbook',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet.' },
        cellRef: { description: 'A1-style cell reference to write the formula to (e.g. "C5").' },
        formula: { description: 'Spreadsheet formula to write (e.g. "=SUM(A1:A10)").' },
      },
    }
  ),

  // --------------------------------------------------
  // Range Operations
  // --------------------------------------------------
  readRange: createValidationPair(
    {
      runtime: z.object({
        workbook: workbookAny(),
        sheet: sheetStr(),
        startCell: z.string().min(1),
        endCell: z.string().min(1),
      }),
      creation: z.object({
        workbook: workbookAny(),
        sheet: sheetStr(),
        startCell: z.string().min(1),
        endCell: z.string().min(1),
      }),
    },
    {
      label: 'Read Range', icon: '📖', category: 'range', description: 'Read all cell values in a rectangular range as a 2D array.',
      returns: 'array',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet.' },
        startCell: { description: 'Top-left cell of the range (A1-style, e.g. "A1").' },
        endCell: { description: 'Bottom-right cell of the range (A1-style, e.g. "D10").' },
      },
    }
  ),

  writeRange: createValidationPair(
    {
      runtime: z.object({
        workbook: workbookAny(),
        sheet: sheetStr(),
        startCell: z.string().min(1),
        values: z.array(z.array(z.any())),
      }),
      creation: z.object({
        workbook: workbookAny(),
        sheet: sheetStr(),
        startCell: z.string().min(1),
        values: z.array(z.array(z.any())),
      }),
    },
    {
      label: 'Write Range', icon: '✍️', category: 'range', description: 'Write a 2D array of values starting from a cell reference.',
      returns: 'workbook',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet.' },
        startCell: { description: 'Top-left cell to begin writing from (A1-style).' },
        values: { description: '2D array of values to write (rows × columns).' },
      },
    }
  ),

  clearRange: createValidationPair(
    {
      runtime: z.object({
        workbook: workbookAny(),
        sheet: sheetStr(),
        startCell: z.string().min(1),
        endCell: z.string().min(1),
      }),
      creation: z.object({
        workbook: workbookAny(),
        sheet: sheetStr(),
        startCell: z.string().min(1),
        endCell: z.string().min(1),
      }),
    },
    {
      label: 'Clear Range', icon: '🧹', category: 'range', description: 'Delete all cell values in a rectangular range.',
      returns: 'workbook',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet.' },
        startCell: { description: 'Top-left cell of the range to clear (A1-style).' },
        endCell: { description: 'Bottom-right cell of the range to clear (A1-style).' },
      },
    }
  ),

  getUsedRange: createValidationPair(
    {
      runtime: z.object({ workbook: workbookAny(), sheet: sheetStr() }),
      creation: z.object({ workbook: workbookAny(), sheet: sheetStr() }),
    },
    {
      label: 'Used Range', icon: '📐', category: 'range', description: "Return the A1:XN reference string for the sheet's used range.",
      returns: 'string',
      fieldConfig: {
        workbook: { description: 'The workbook object.' },
        sheet: { description: 'Name of the sheet to get the used range for.' },
      },
    }
  ),

  // --------------------------------------------------
  // Metadata
  // --------------------------------------------------
  getSpreadsheetInfo: createValidationPair(
    {
      runtime: z.object({ path: pathReq() }),
      creation: z.object({ path: pathReq() }),
    },
    {
      label: 'Spreadsheet Info', icon: 'ℹ️', category: 'spreadsheet', description: 'Return file metadata (size, createdAt, modifiedAt) for a spreadsheet.',
      returns: 'object',
      fieldConfig: { path: { description: 'Path to the spreadsheet file to get info for.' } },
    }
  ),
};
