import { z } from 'zod';
import type { Sharp } from 'sharp';

// Type guard for Sharp instance
export const isImageInstance = (val: unknown): val is Sharp => {
  return (
    typeof val === 'object' &&
    val !== null &&
    val.constructor &&
    val.constructor.name === 'Sharp' &&
    // Add more specific Sharp method checks
    typeof (val as Sharp).resize === 'function' &&
    typeof (val as Sharp).toFormat === 'function' &&
    typeof (val as Sharp).toBuffer === 'function' &&
    typeof (val as Sharp).metadata === 'function'
  );
};

// Schema using Sharp's type with the type guard
export const imageSchema = z.custom<Sharp>(isImageInstance, {
  message: 'Invalid image instance (Sharp instance expected)',
});

// Re-export the type for convenience
export type { Sharp } from 'sharp';
