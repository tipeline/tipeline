import { z } from 'zod';
import type { Browser } from 'puppeteer';

// Type guard for Puppeteer Browser
export const isBrowserInstance = (val: unknown): val is Browser => {
  return (
    typeof val === 'object' &&
    val !== null &&
    typeof (val as Browser).close === 'function' &&
    typeof (val as Browser).newPage === 'function' &&
    // Add more specific Puppeteer Browser checks
    typeof (val as Browser).pages === 'function' &&
    typeof (val as Browser).version === 'function'
  );
};

// Schema using Puppeteer's Browser type
export const browserSchema = z.custom<Browser>(isBrowserInstance, {
  message: 'Invalid browser instance (Puppeteer Browser expected)',
});

// Re-export the type for convenience
export type { Browser } from 'puppeteer';
