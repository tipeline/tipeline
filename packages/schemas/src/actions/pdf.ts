import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { orTemplateString } from './../templateValidation';

export const meta = {
  label: 'PDF',
  icon: 'FileType'
}

export const validations = {
  extractText: createValidationPair(
    {
      runtime: z.object({
        path: z.string().min(1, 'pdf.path.required'),
      }),
      creation: z.object({
        path: orTemplateString(z.string().min(1, 'pdf.path.required')),
      }),
    },
    {
      label: 'Extract Text', icon: '🧾', category: 'pdf', description: 'Extract all text from a PDF.',
      returns: 'string',
      fieldConfig: { path: { description: 'Path to the PDF file to extract text from.' } },
    }
  ),

  extractImage: createValidationPair(
    {
      runtime: z.object({
        path: z.string().min(1, 'pdf.pdfPath.required'),
        output: z.string(),
      }),
      creation: z.object({
        path: orTemplateString(z.string().min(1, 'pdf.pdfPath.required')),
        output: orTemplateString(z.string()),
      }),
    },
    {
      label: 'Extract Images', icon: '🖼️', category: 'pdf', description: 'Extract images from a PDF to an output path.',
      fieldConfig: {
        path: { description: 'Path to the PDF file to extract images from.' },
        output: { description: 'Directory path where extracted images will be saved.' },
      },
    }
  ),

  merge: createValidationPair(
    {
      runtime: z.object({
        input: z.array(z.string().min(1)).nonempty(),
        output: z.string().min(1),
      }),
      creation: z.object({
        input: orTemplateString(z.array(z.string().min(1)).nonempty()),
        output: orTemplateString(z.string().min(1)),
      }),
    },
    {
      label: 'Merge PDFs', icon: '➕🧾', category: 'pdf', description: 'Merge multiple PDFs into one.',
      fieldConfig: {
        input: { description: 'List of PDF file paths to merge in order.' },
        output: { description: 'Destination path for the merged PDF.' },
      },
    }
  ),

  getPageCount: createValidationPair(
    {
      runtime: z.object({
        path: z.string().min(1, 'pdf.path.required'),
      }),
      creation: z.object({
        path: orTemplateString(z.string().min(1, 'pdf.path.required')),
      }),
    },
    {
      label: 'Get Page Count', icon: '📄', category: 'pdf', description: 'Return the total number of pages in a PDF.',
      returns: 'number',
      fieldConfig: { path: { description: 'Path to the PDF file to count pages in.' } },
    }
  ),

  splitPages: createValidationPair(
    {
      runtime: z.object({
        path: z.string().min(1, 'pdf.path.required'),
        output: z.string().min(1, 'pdf.output.required'),
        prefix: z.string().optional(),
      }),
      creation: z.object({
        path: orTemplateString(z.string().min(1, 'pdf.path.required')),
        output: orTemplateString(z.string().min(1, 'pdf.output.required')),
        prefix: orTemplateString(z.string()).optional(),
      }),
    },
    {
      label: 'Split Pages', icon: '✂️', category: 'pdf', description: 'Split a PDF into one file per page.',
      fieldConfig: {
        path: { description: 'Path to the PDF file to split.' },
        output: { description: 'Directory path where the per-page PDF files will be saved.' },
        prefix: { description: 'Optional filename prefix for the output files (e.g. "page" → page1.pdf).' },
      },
    }
  ),
};
