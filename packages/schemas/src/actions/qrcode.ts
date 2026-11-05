import { z } from 'zod';
import { createValidationPair } from './../createValidation';

export const meta = {
  label: 'QR Code',
  icon: 'QrCode'
}

export const validations = {
  generate: createValidationPair(
    {
      runtime: z.object({
        text: z.string().min(1),
        path: z.string().min(1),
      }),
      creation: z.object({
        text: z.string().min(1),
        path: z.string().min(1),
      }),
    },
    {
      label: 'Generate QR Code', icon: '🧾➡️🔳', category: 'qrcode', description: 'Create a QR code image from text.',
      fieldConfig: {
        text: { description: 'Text or URL to encode in the QR code.' },
        path: { description: 'Output file path to save the generated QR code image.' },
      },
    }
  ),

  read: createValidationPair(
    {
      runtime: z.object({
        path: z.string().min(1),
      }),
      creation: z.object({
        path: z.string().min(1),
      }),
    },
    {
      label: 'Read QR Code', icon: '🔳➡️🔤', category: 'qrcode', description: 'Decode text from a QR code image.',
      returns: 'string',
      fieldConfig: { path: { description: 'File path of the QR code image to decode.' } },
    }
  ),
};
