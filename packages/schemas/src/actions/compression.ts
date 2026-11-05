import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { orTemplateString } from './../templateValidation';

export const meta = {
  label: 'Compression',
  icon: 'FileArchive'
}

export const validations = {
  archive: createValidationPair(
    {
      runtime: z.object({
        path: z.string(),                // Output archive path
        sources: z.array(z.string()),    // Files/directories/globs
        level: z.number().min(0).max(9).optional(),
        format: z.enum(['zip', 'tar', 'tar.gz']),
        password: z.string().optional(), // Not implemented
      }),
      creation: z.object({
        path: z.string(),
        sources: orTemplateString(z.array(z.string())),
        level: orTemplateString(z.number().min(0).max(9)).optional(),
        format: orTemplateString(z.enum(['zip', 'tar', 'tar.gz'])),
        password: z.string().optional(),
      }),
    },
    {
      label: 'Archive', icon: '📦', category: 'compression', description: 'Create an archive from sources.',
      returns: 'boolean',
      fieldConfig: {
        path: { description: 'Destination path for the output archive file.' },
        sources: { description: 'List of file paths, directories, or globs to include in the archive.' },
        level: { description: 'Compression level (0 = no compression, 9 = maximum).' },
        format: { description: 'Archive format: zip, tar, or tar.gz.' },
        password: { description: 'Optional password to protect the archive (not yet implemented).' },
      },
    }
  ),

  unarchive: createValidationPair(
    {
      runtime: z.object({
        path: z.string(),          // Path to archive
        destination: z.string(),   // Destination folder
        password: z.string().optional(), // Not implemented
      }),
      creation: z.object({
        path: z.string(),
        destination: z.string(),
        password: z.string().optional(),
      }),
    },
    {
      label: 'Unarchive', icon: '📂', category: 'compression', description: 'Extract an archive to a folder.',
      returns: 'boolean',
      fieldConfig: {
        path: { description: 'Path to the archive file to extract.' },
        destination: { description: 'Directory where extracted files will be placed.' },
        password: { description: 'Optional password to decrypt the archive (not yet implemented).' },
      },
    }
  ),
};
