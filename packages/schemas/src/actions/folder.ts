import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { orTemplateString } from './../templateValidation';

const pathStr = () => z.string();

export const meta = {
  label: 'Folder',
  icon: 'Folder'
}

export const validations = {
  exists: createValidationPair(
    {
      runtime: z.object({ src: pathStr() }),
      creation: z.object({ src: pathStr() }),
    },
    {
      label: 'Folder Exists', icon: '📁', category: 'folder', description: 'Check whether a folder exists.',
      returns: 'boolean',
      fieldConfig: { src: { description: 'Path of the folder to check.' } },
    }
  ),

  getFiles: createValidationPair(
    {
      runtime: z.object({
        src: pathStr(),
        fullPaths: z.boolean().optional().default(false),
        extensions: z.array(z.string()).optional(),
      }),
      creation: z.object({
        src: pathStr(),
        fullPaths: orTemplateString(z.boolean()).optional(),
        extensions: orTemplateString(z.array(z.string())).optional(),
      }),
    },
    {
      label: 'Get Files', icon: '📄', category: 'folder',
      description:
        'List the entries in a folder (not recursive). Returns bare names like "photo.jpg", not paths, and includes subfolders, unless fullPaths or extensions is set.',
      returns: 'array',
      fieldConfig: {
        src: { description: 'Path of the folder to list files from.' },
        fullPaths: {
          description: 'Return full paths (folder + name) instead of bare names. Defaults to false.',
        },
        extensions: {
          description:
            'Only return files with one of these extensions, e.g. ["jpg", "png"]. Case-insensitive; subfolders are left out.',
        },
      },
    }
  ),

  getSubfolders: createValidationPair(
    {
      runtime: z.object({ src: pathStr() }),
      creation: z.object({ src: pathStr() }),
    },
    {
      label: 'Get Subfolders', icon: '🗂️', category: 'folder', description: 'List subfolders in a folder.',
      returns: 'array',
      fieldConfig: { src: { description: 'Path of the folder to list subfolders from.' } },
    }
  ),

  create: createValidationPair(
    {
      runtime: z.object({ src: pathStr() }),
      creation: z.object({ src: pathStr() }),
    },
    {
      label: 'Create Folder', icon: '➕', category: 'folder', description: 'Create a folder (recursive as needed).',
      returns: 'string',
      fieldConfig: { src: { description: 'Path of the folder to create (parent directories created automatically).' } },
    }
  ),

  'delete': createValidationPair(
    {
      runtime: z.object({ src: pathStr() }),
      creation: z.object({ src: pathStr() }),
    },
    {
      label: 'Delete Folder', icon: '🗑️', category: 'folder', description: 'Delete a folder.',
      returns: 'boolean',
      fieldConfig: { src: { description: 'Path of the folder to delete.' } },
    }
  ),

  empty: createValidationPair(
    {
      runtime: z.object({ src: pathStr() }),
      creation: z.object({ src: pathStr() }),
    },
    {
      label: 'Empty Folder', icon: '🧹', category: 'folder', description: 'Remove all contents of a folder.',
      returns: 'boolean',
      fieldConfig: { src: { description: 'Path of the folder to empty (all contents deleted, folder remains).' } },
    }
  ),

  copy: createValidationPair(
    {
      runtime: z.object({ src: pathStr(), dest: pathStr() }),
      creation: z.object({ src: pathStr(), dest: pathStr() }),
    },
    {
      label: 'Copy Folder', icon: '📂➡️', category: 'folder', description: 'Copy a folder to a destination.',
      returns: 'boolean',
      fieldConfig: {
        src: { description: 'Source folder path to copy.' },
        dest: { description: 'Destination path for the copied folder.' },
      },
    }
  ),

  move: createValidationPair(
    {
      runtime: z.object({ src: pathStr(), dest: pathStr() }),
      creation: z.object({ src: pathStr(), dest: pathStr() }),
    },
    {
      label: 'Move Folder', icon: '📦➡️', category: 'folder', description: 'Move a folder to a destination.',
      returns: 'boolean',
      fieldConfig: {
        src: { description: 'Source folder path to move.' },
        dest: { description: 'Destination path for the moved folder.' },
      },
    }
  ),

  rename: createValidationPair(
    {
      runtime: z.object({ oldPath: pathStr(), newPath: pathStr() }),
      creation: z.object({ oldPath: pathStr(), newPath: pathStr() }),
    },
    {
      label: 'Rename Folder', icon: '🏷️', category: 'folder', description: 'Rename a folder.',
      returns: 'boolean',
      fieldConfig: {
        oldPath: { description: 'Current path of the folder.' },
        newPath: { description: 'New path (name) for the folder.' },
      },
    }
  ),
};
