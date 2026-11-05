import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx-republish';
import { GroupSpreadsheet } from '@/action/actions/spreadsheet/actions';

// The spreadsheet action group reads/writes real files via `fs` and uses the
// `xlsx-republish` library to build workbook objects in memory. Both are pure,
// synchronous, filesystem-local operations with no network or process side
// effects, so per the task instructions we exercise them for real against a
// scratch directory under os.tmpdir() instead of mocking `fs`/`xlsx-republish`.

let tmpDir: string;

function tmpFile(name: string): string {
  return path.join(tmpDir, name);
}

function buildWorkbook(rows: any[][] = [['Name', 'Age', 'Active']]): any {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return wb;
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tipeline-spreadsheet-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GroupSpreadsheet', () => {
  // --------------------------------------------------
  // File-level Actions
  // --------------------------------------------------
  describe('open', () => {
    it('reads a real xlsx file from disk and returns a workbook', async () => {
      const filePath = tmpFile('input.xlsx');
      const wb = buildWorkbook([['A', 'B'], [1, 2]]);
      fs.writeFileSync(filePath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

      const result = await GroupSpreadsheet.open({ path: filePath });
      expect(result.SheetNames).toContain('Sheet1');
      expect(XLSX.utils.sheet_to_json(result.Sheets['Sheet1'], { header: 1 })).toEqual([
        ['A', 'B'],
        [1, 2],
      ]);
    });

    it('rejects with a validation error when path is missing', async () => {
      await expect(GroupSpreadsheet.open({} as any)).rejects.toThrow();
    });

    it('propagates a filesystem error when the file does not exist', async () => {
      await expect(GroupSpreadsheet.open({ path: tmpFile('missing.xlsx') })).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('creates a new file on disk with a single "Sheet1"', async () => {
      const filePath = tmpFile('created.xlsx');
      const wb = await GroupSpreadsheet.create({ path: filePath });

      expect(fs.existsSync(filePath)).toBe(true);
      expect(wb.SheetNames).toEqual(['Sheet1']);
    });

    it('propagates a filesystem error when the directory does not exist (edge case)', async () => {
      await expect(
        GroupSpreadsheet.create({ path: tmpFile('nonexistent-dir/created.xlsx') })
      ).rejects.toThrow();
    });

    it('rejects with a validation error when path is missing', async () => {
      await expect(GroupSpreadsheet.create({} as any)).rejects.toThrow();
    });
  });

  describe('save', () => {
    it('writes the workbook buffer to the given path', async () => {
      const filePath = tmpFile('saved.xlsx');
      const wb = buildWorkbook([['X'], [42]]);

      const result = await GroupSpreadsheet.save({ path: filePath, workbook: wb });

      expect(result).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
      const reread = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' });
      expect(XLSX.utils.sheet_to_json(reread.Sheets['Sheet1'], { header: 1 })).toEqual([
        ['X'],
        [42],
      ]);
    });

    it('rejects with a validation error when path is missing', async () => {
      await expect(GroupSpreadsheet.save({ workbook: buildWorkbook() } as any)).rejects.toThrow();
    });

    it('propagates a filesystem error when the directory does not exist', async () => {
      await expect(
        GroupSpreadsheet.save({ path: tmpFile('nope/saved.xlsx'), workbook: buildWorkbook() })
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('removes an existing file from disk', async () => {
      const filePath = tmpFile('to-delete.xlsx');
      fs.writeFileSync(filePath, 'placeholder');

      const result = await GroupSpreadsheet.delete({ path: filePath });

      expect(result).toBe(true);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('propagates a filesystem error when the file does not exist', async () => {
      await expect(GroupSpreadsheet.delete({ path: tmpFile('missing.xlsx') })).rejects.toThrow();
    });

    it('rejects with a validation error when path is missing', async () => {
      await expect(GroupSpreadsheet.delete({} as any)).rejects.toThrow();
    });
  });

  // --------------------------------------------------
  // Sheet Management
  // --------------------------------------------------
  describe('getSheetNames', () => {
    it('returns all sheet names in the workbook', async () => {
      const wb = buildWorkbook();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Notes');

      const result = await GroupSpreadsheet.getSheetNames({ workbook: wb });
      expect(result).toEqual(['Sheet1', 'Notes']);
    });

    it('rejects with a validation error when workbook is missing', async () => {
      await expect(GroupSpreadsheet.getSheetNames({} as any)).rejects.toThrow();
    });
  });

  describe('addSheet', () => {
    it('adds a new empty sheet with the given name', async () => {
      const wb = buildWorkbook();
      const result = await GroupSpreadsheet.addSheet({ workbook: wb, name: 'Summary' });

      expect(result).toBe(wb);
      expect(wb.SheetNames).toContain('Summary');
    });

    it('rejects with a validation error when name is empty', async () => {
      await expect(GroupSpreadsheet.addSheet({ workbook: buildWorkbook(), name: '' })).rejects.toThrow();
    });
  });

  describe('deleteSheet', () => {
    it('removes an existing sheet by name', async () => {
      const wb = buildWorkbook();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'Staging');

      const result = await GroupSpreadsheet.deleteSheet({ workbook: wb, name: 'Staging' });

      expect(result).toBe(wb);
      expect(wb.SheetNames).not.toContain('Staging');
      expect(wb.Sheets['Staging']).toBeUndefined();
    });

    it('throws the source-defined error when the sheet does not exist', async () => {
      const wb = buildWorkbook();
      await expect(GroupSpreadsheet.deleteSheet({ workbook: wb, name: 'Ghost' })).rejects.toThrow(
        "Sheet 'Ghost' not found"
      );
    });
  });

  describe('renameSheet', () => {
    it('renames an existing sheet and preserves its contents', async () => {
      const wb = buildWorkbook([['a'], [1]]);
      const result = await GroupSpreadsheet.renameSheet({
        workbook: wb,
        name: 'Sheet1',
        newName: 'Sales Q1',
      });

      expect(result.SheetNames).toEqual(['Sales Q1']);
      expect(result.Sheets['Sales Q1']).toBeDefined();
      expect(result.Sheets['Sheet1']).toBeUndefined();
    });

    it('throws the source-defined error when the sheet does not exist', async () => {
      const wb = buildWorkbook();
      await expect(
        GroupSpreadsheet.renameSheet({ workbook: wb, name: 'Ghost', newName: 'New' })
      ).rejects.toThrow("Sheet 'Ghost' not found");
    });
  });

  describe('toJson', () => {
    it('converts a sheet to row objects keyed by the header row', async () => {
      const wb = buildWorkbook([
        ['Name', 'Age'],
        ['Alice', 30],
        ['Bob', 25],
      ]);
      const result = await GroupSpreadsheet.toJson({ workbook: wb, sheet: 'Sheet1' });
      expect(result).toEqual([
        { Name: 'Alice', Age: 30 },
        { Name: 'Bob', Age: 25 },
      ]);
    });

    it('returns an empty array when the sheet has no data (edge case)', async () => {
      const wb = buildWorkbook([[]]);
      const result = await GroupSpreadsheet.toJson({ workbook: wb, sheet: 'Sheet1' });
      expect(result).toEqual([]);
    });

    it('returns an empty array when the sheet does not exist', async () => {
      const wb = buildWorkbook();
      const result = await GroupSpreadsheet.toJson({ workbook: wb, sheet: 'Missing' });
      expect(result).toEqual([]);
    });
  });

  describe('toArray', () => {
    it('converts a sheet to a 2D array including the header row', async () => {
      const wb = buildWorkbook([
        ['Name', 'Age'],
        ['Alice', 30],
      ]);
      const result = await GroupSpreadsheet.toArray({ workbook: wb, sheet: 'Sheet1' });
      expect(result).toEqual([
        ['Name', 'Age'],
        ['Alice', 30],
      ]);
    });

    it('returns an empty array for an empty sheet (edge case)', async () => {
      const wb = buildWorkbook([[]]);
      const result = await GroupSpreadsheet.toArray({ workbook: wb, sheet: 'Sheet1' });
      expect(result).toEqual([]);
    });
  });

  // --------------------------------------------------
  // Row Operations
  // --------------------------------------------------
  describe('appendRow', () => {
    it('appends a row after the last used row', async () => {
      const wb = buildWorkbook([['Header']]);
      const result = await GroupSpreadsheet.appendRow({
        workbook: wb,
        sheet: 'Sheet1',
        values: ['Value'],
      });
      const rows = await GroupSpreadsheet.toArray({ workbook: result, sheet: 'Sheet1' });
      expect(rows).toEqual([['Header'], ['Value']]);
    });

    it('works on an empty sheet (edge case)', async () => {
      const wb = buildWorkbook([[]]);
      const result = await GroupSpreadsheet.appendRow({
        workbook: wb,
        sheet: 'Sheet1',
        values: ['First'],
      });
      const rows = await GroupSpreadsheet.toArray({ workbook: result, sheet: 'Sheet1' });
      expect(rows).toEqual([['First']]);
    });

    it('throws the source-defined error when the sheet does not exist', async () => {
      const wb = buildWorkbook();
      await expect(
        GroupSpreadsheet.appendRow({ workbook: wb, sheet: 'Ghost', values: [1] })
      ).rejects.toThrow('Sheet "Ghost" not found');
    });
  });

  describe('getRowCount', () => {
    it('returns the number of used rows', async () => {
      const wb = buildWorkbook([['a'], ['b'], ['c']]);
      const result = await GroupSpreadsheet.getRowCount({ workbook: wb, sheet: 'Sheet1' });
      expect(result).toBe(3);
    });

    it('returns 0 for a sheet with no data (edge case)', async () => {
      const wb = buildWorkbook([[]]);
      const result = await GroupSpreadsheet.getRowCount({ workbook: wb, sheet: 'Sheet1' });
      expect(result).toBe(0);
    });
  });

  // --------------------------------------------------
  // Cell Operations
  // --------------------------------------------------
  describe('readCell', () => {
    it('reads a cell value by row/col index', async () => {
      const wb = buildWorkbook([['a', 'b'], [1, 2]]);
      const result = await GroupSpreadsheet.readCell({ workbook: wb, sheet: 'Sheet1', row: 1, col: 1 });
      expect(result).toBe(2);
    });

    it('returns null for an empty cell (edge case)', async () => {
      const wb = buildWorkbook([['a']]);
      const result = await GroupSpreadsheet.readCell({ workbook: wb, sheet: 'Sheet1', row: 5, col: 5 });
      expect(result).toBeNull();
    });
  });

  describe('writeCell', () => {
    it('writes a value to a cell by row/col index', async () => {
      const wb = buildWorkbook([[]]);
      const result = await GroupSpreadsheet.writeCell({
        workbook: wb,
        sheet: 'Sheet1',
        row: 3,
        col: 1,
        value: 'completed',
      });
      expect(
        await GroupSpreadsheet.readCell({ workbook: result, sheet: 'Sheet1', row: 3, col: 1 })
      ).toBe('completed');
    });
  });

  describe('clearCell', () => {
    it('deletes the value from a cell', async () => {
      const wb = buildWorkbook([['a', 'b']]);
      const result = await GroupSpreadsheet.clearCell({ workbook: wb, sheet: 'Sheet1', row: 0, col: 0 });
      expect(
        await GroupSpreadsheet.readCell({ workbook: result, sheet: 'Sheet1', row: 0, col: 0 })
      ).toBeNull();
    });
  });

  describe('getCellAddress', () => {
    it('converts a row/col index pair to an A1-style reference', async () => {
      const result = await GroupSpreadsheet.getCellAddress({ row: 3, col: 2 });
      expect(result).toBe('C4');
    });

    it('rejects with a validation error for a negative index', async () => {
      await expect(GroupSpreadsheet.getCellAddress({ row: -1, col: 0 } as any)).rejects.toThrow();
    });
  });

  describe('readCellByRef', () => {
    it('reads a cell value by A1-style reference', async () => {
      const wb = buildWorkbook([['a', 'b'], ['c', 'd']]);
      const result = await GroupSpreadsheet.readCellByRef({ workbook: wb, sheet: 'Sheet1', cellRef: 'B2' });
      expect(result).toBe('d');
    });

    it('returns null for an empty cell reference (edge case)', async () => {
      const wb = buildWorkbook([['a']]);
      const result = await GroupSpreadsheet.readCellByRef({ workbook: wb, sheet: 'Sheet1', cellRef: 'Z99' });
      expect(result).toBeNull();
    });
  });

  describe('setCellFormula', () => {
    it('writes a formula to a cell by reference', async () => {
      const wb = buildWorkbook([[]]);
      const result = await GroupSpreadsheet.setCellFormula({
        workbook: wb,
        sheet: 'Sheet1',
        cellRef: 'A11',
        formula: 'SUM(A1:A10)',
      });
      expect(result.Sheets['Sheet1']['A11']).toEqual({ t: 'n', f: 'SUM(A1:A10)' });
    });

    it('throws the source-defined error when the sheet does not exist', async () => {
      const wb = buildWorkbook();
      await expect(
        GroupSpreadsheet.setCellFormula({
          workbook: wb,
          sheet: 'Ghost',
          cellRef: 'A1',
          formula: 'SUM(A1:A2)',
        })
      ).rejects.toThrow('Sheet "Ghost" not found');
    });
  });

  // --------------------------------------------------
  // Range Operations
  // --------------------------------------------------
  describe('readRange', () => {
    it('reads a rectangular range as a 2D array', async () => {
      const wb = buildWorkbook([
        ['a', 'b', 'c'],
        ['d', 'e', 'f'],
      ]);
      const result = await GroupSpreadsheet.readRange({
        workbook: wb,
        sheet: 'Sheet1',
        startCell: 'A1',
        endCell: 'B2',
      });
      expect(result).toEqual([
        ['a', 'b'],
        ['d', 'e'],
      ]);
    });

    it('prefixes formula cells with "=" (edge case)', async () => {
      const wb = buildWorkbook([[]]);
      wb.Sheets['Sheet1']['A1'] = { t: 'n', f: 'SUM(B1:B2)' };
      wb.Sheets['Sheet1']['!ref'] = 'A1:A1';
      const result = await GroupSpreadsheet.readRange({
        workbook: wb,
        sheet: 'Sheet1',
        startCell: 'A1',
        endCell: 'A1',
      });
      expect(result).toEqual([['=SUM(B1:B2)']]);
    });
  });

  describe('writeRange', () => {
    it('writes a 2D array of values starting from a cell reference', async () => {
      const wb = buildWorkbook([[]]);
      const result = await GroupSpreadsheet.writeRange({
        workbook: wb,
        sheet: 'Sheet1',
        startCell: 'A1',
        values: [
          ['Name', 'Age'],
          ['Alice', 30],
        ],
      });
      const rows = await GroupSpreadsheet.toArray({ workbook: result, sheet: 'Sheet1' });
      expect(rows).toEqual([
        ['Name', 'Age'],
        ['Alice', 30],
      ]);
    });
  });

  describe('clearRange', () => {
    it('deletes all values in a rectangular range', async () => {
      const wb = buildWorkbook([
        ['a', 'b'],
        ['c', 'd'],
      ]);
      const result = await GroupSpreadsheet.clearRange({
        workbook: wb,
        sheet: 'Sheet1',
        startCell: 'A1',
        endCell: 'B1',
      });
      const rows = await GroupSpreadsheet.toArray({ workbook: result, sheet: 'Sheet1' });
      expect(rows[0]).toEqual([]);
    });
  });

  describe('getUsedRange', () => {
    it('returns the A1:XN reference for the used range', async () => {
      const wb = buildWorkbook([
        ['a', 'b'],
        ['c', 'd'],
      ]);
      const result = await GroupSpreadsheet.getUsedRange({ workbook: wb, sheet: 'Sheet1' });
      expect(result).toBe('A1:B2');
    });

    it('returns null when the sheet is empty (edge case)', async () => {
      const wb = buildWorkbook();
      delete wb.Sheets['Sheet1']['!ref'];
      const result = await GroupSpreadsheet.getUsedRange({ workbook: wb, sheet: 'Sheet1' });
      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------
  // Metadata
  // --------------------------------------------------
  describe('getSpreadsheetInfo', () => {
    it('returns size, createdAt, and modifiedAt for an existing file', async () => {
      const filePath = tmpFile('info.xlsx');
      fs.writeFileSync(filePath, 'hello world');

      const result = await GroupSpreadsheet.getSpreadsheetInfo({ path: filePath });

      expect(result.size).toBe(Buffer.byteLength('hello world'));
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.modifiedAt).toBeInstanceOf(Date);
    });

    it('propagates a filesystem error when the file does not exist', async () => {
      await expect(
        GroupSpreadsheet.getSpreadsheetInfo({ path: tmpFile('missing.xlsx') })
      ).rejects.toThrow();
    });

    it('rejects with a validation error when path is missing', async () => {
      await expect(GroupSpreadsheet.getSpreadsheetInfo({} as any)).rejects.toThrow();
    });
  });
});
