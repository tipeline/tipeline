import { z } from 'zod';

// Structural shape of a parsed xlsx-republish (SheetJS-compatible) workbook.
// Duck-typed rather than imported from xlsx-republish since that library is
// only a runtime dependency of apps/core — packages/types stays dependency-free.
export interface WorkbookLike {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}

export const isWorkbookInstance = (val: unknown): val is WorkbookLike => {
  return (
    typeof val === 'object' &&
    val !== null &&
    Array.isArray((val as WorkbookLike).SheetNames) &&
    (val as WorkbookLike).SheetNames.every((name) => typeof name === 'string') &&
    typeof (val as WorkbookLike).Sheets === 'object' &&
    (val as WorkbookLike).Sheets !== null
  );
};

export const workbookSchema = z.custom<WorkbookLike>(isWorkbookInstance, {
  message: 'Invalid workbook object (expected a parsed spreadsheet workbook with SheetNames and Sheets)',
});
