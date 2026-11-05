import { z } from 'zod';
import { createValidationPair } from './../createValidation';

export const meta = {
  label: 'OCR',
  icon: 'ScanText'
}

export const validations = {
  recognize: createValidationPair(
    {
      runtime: z.object({
        source: z.string(),
        language: z.string(),
      }),
      creation: z.object({
        source: z.string(),
        language: z.string(),
      }),
    },
    {
      label: 'OCR Recognize', icon: '🔤', category: 'ocr', description: 'Extract text from an image or document.',
      returns: 'string',
      fieldConfig: {
        source: { description: 'File path or URL of the image or document to recognize.' },
        language: { description: 'Language code for OCR recognition (e.g. "eng" for English).' },
      },
    }
  ),
};
