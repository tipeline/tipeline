import { z } from 'zod';
import { createValidationPair } from './../createValidation';

// Add this helper with your other helpers
const preRows = () =>
  z.union([
    z.array(z.record(z.any(), z.any())),
    z.string().refine(
      (val) => /^\{=\s*.+\s*=\}$/.test(val.trim()),
      {
        message: 'Must be an array of records or a variable reference (e.g., {= rows =})',
      }
    ),
  ]);

const pathStr = () => z.string();

const csvReadOptions = z.object({
  columns: z.boolean(),
  skip_empty_lines: z.boolean(),
  delimiter: z.string(),
  trim: z.boolean(),
});

export const meta = {
  label: 'File',
  icon: 'FileText',
};

export const validations = {
  fileExists: createValidationPair(
    {
      runtime: z.object({ src: pathStr() }),
      creation: z.object({ src: pathStr() }),
    },
    {
      label: 'File Exists',
      icon: '🗂️',
      category: 'file',
      description: 'Check whether a path exists.',
      returns: 'boolean',
      fieldConfig: {
        src: { description: 'File or directory path to check for existence.', component: 'path-select', dialogMode: 'open' },
      },
    }
  ),

  copy: createValidationPair(
    {
      runtime: z.object({ src: pathStr(), dest: pathStr() }),
      creation: z.object({ src: pathStr(), dest: pathStr() }),
    },
    {
      label: 'Copy', icon: '📄➡️', category: 'file', description: 'Copy a file or directory.',
      returns: 'boolean',
      fieldConfig: {
        src: { description: 'Source file or directory path to copy.', component: 'path-select', dialogMode: 'open' },
        dest: { description: 'Destination path for the copy.', component: 'path-select', dialogMode: 'save' },
      },
    }
  ),

  move: createValidationPair(
    {
      runtime: z.object({ src: pathStr(), dest: pathStr() }),
      creation: z.object({ src: pathStr(), dest: pathStr() }),
    },
    {
      label: 'Move',
      icon: '📄🔀',
      category: 'file',
      description: 'Move/rename a file or directory.',
      returns: 'boolean',
      fieldConfig: {
        src: { description: 'Source file or directory path to move.', component: 'path-select', dialogMode: 'open' },
        dest: { description: 'Destination path (including new filename if renaming).', component: 'path-select', dialogMode: 'save' },
      },
    }
  ),

  remove: createValidationPair(
    {
      runtime: z.object({ src: pathStr() }),
      creation: z.object({ src: pathStr() }),
    },
    {
      label: 'Remove', icon: '🗑️', category: 'file', description: 'Delete a file or directory.',
      returns: 'boolean',
      fieldConfig: {
        src: { description: 'Path of the file or directory to delete.', component: 'path-select', dialogMode: 'open' },
      },
    }
  ),

  rename: createValidationPair(
    {
      runtime: z.object({ oldPath: pathStr(), newPath: pathStr() }),
      creation: z.object({ oldPath: pathStr(), newPath: pathStr() }),
    },
    {
      label: 'Rename', icon: '🏷️', category: 'file', description: 'Rename a file or directory.',
      returns: 'boolean',
      fieldConfig: {
        oldPath: { description: 'Current path of the file or directory.', component: 'path-select', dialogMode: 'open' },
        newPath: { description: 'New path (name) for the file or directory.', component: 'path-select', dialogMode: 'save' },
      },
    }
  ),

  read: createValidationPair(
    {
      runtime: z.object({ src: pathStr() }),
      creation: z.object({ src: pathStr() }),
    },
    {
      label: 'Read', icon: '📖', category: 'file', description: 'Read a file as text.',
      returns: 'string',
      fieldConfig: {
        src: { description: 'Path of the file to read.', component: 'path-select', dialogMode: 'open' },
      },
    }
  ),

  write: createValidationPair(
    {
      runtime: z.object({ src: pathStr(), data: z.string() }),
      creation: z.object({ src: pathStr(), data: z.string() }),
    },
    {
      label: 'Write', icon: '✍️', category: 'file', description: 'Write text to a file.',
      returns: 'boolean',
      fieldConfig: {
        src: { description: 'Destination path for the file to write.', component: 'path-select', dialogMode: 'save' },
        data: { description: 'Text content to write to the file.', component: 'textarea-variable' },
      },
    }
  ),

  readCSV: createValidationPair(
    {
      runtime: z.object({ src: pathStr(), options: csvReadOptions }),
      creation: z.object({ src: pathStr(), options: csvReadOptions }),
    },
    {
      label: 'Read CSV', icon: '🧾', category: 'file', description: 'Parse a CSV file into rows.',
      returns: 'array',
      fieldConfig: {
        src: { description: 'Path to the CSV file to read.', component: 'path-select', dialogMode: 'open' },
        options: { description: 'CSV parsing options (columns, delimiter, trim, skip empty lines).' },
      },
    }
  ),

  writeCSV: createValidationPair(
    {
      runtime: z.object({ src: pathStr(), rows: z.array(z.record(z.any(), z.any())) }),
      creation: z.object({ src: pathStr(), rows: preRows() }),
    },
    {
      label: 'Write CSV', icon: '🧾✍️', category: 'file', description: 'Write rows to a CSV file.',
      returns: 'boolean',
      fieldConfig: {
        src: { description: 'Destination path for the CSV file.', component: 'path-select', dialogMode: 'save' },
        rows: { description: 'Array of record objects to write as CSV rows.' },
      },
    }
  ),

  getFilePathPart: createValidationPair(
    {
      runtime: z.object({
        src: pathStr(),
        part: z.enum(['dirname', 'basename', 'extname', 'filename', 'root']),
      }),
      creation: z.object({
        src: pathStr(),
        part: z.enum(['dirname', 'basename', 'extname', 'filename', 'root']),
      }),
    },
    {
      label: 'Path Part',
      icon: '🧩',
      category: 'file',
      description: 'Extract a portion of a file path.',
      returns: 'string',
      fieldConfig: {
        src: { description: 'The file path to extract a part from.', component: 'path-select', dialogMode: 'open' },
        part: { description: 'Part to extract: dirname, basename, extname, filename, or root.' },
      },
    }
  ),

  convertFileToBase64: createValidationPair(
    {
      runtime: z.object({ src: pathStr() }),
      creation: z.object({ src: pathStr() }),
    },
    {
      label: 'File → Base64',
      icon: '🔁',
      category: 'file',
      description: 'Encode a file to Base64.',
      returns: 'string',
      fieldConfig: {
        src: { description: 'Path of the file to encode as Base64.', component: 'path-select', dialogMode: 'open' },
      },
    }
  ),

  convertBase64ToFile: createValidationPair(
    {
      runtime: z.object({ dest: pathStr(), base64: z.string() }),
      creation: z.object({ dest: pathStr(), base64: z.string() }),
    },
    {
      label: 'Base64 → File',
      icon: '🔁',
      category: 'file',
      description: 'Decode Base64 and write to a file.',
      returns: 'boolean',
      fieldConfig: {
        dest: { description: 'Destination path to write the decoded file content.', component: 'path-select', dialogMode: 'save' },
        base64: { description: 'The Base64-encoded string to decode and write.' },
      },
    }
  ),
};
