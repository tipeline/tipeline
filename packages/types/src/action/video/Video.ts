import { z } from 'zod';

// Update the interface to include all Video class properties and methods
export interface VideoData {
  input: string;
  prefixOptions: string[][];
  suffixOptions: string[][];
  videoFilters: string[];
  audioFilters: string[];
  tempFiles: string[];
  // Include the methods
  reset(newInput: string): void;
  createTempFile(ext?: string): string;
  cleanup(): void;
}

// Update validation to check for Video class instance specifically
export const isVideoInstance = (val: unknown): val is VideoData => {
  return (
    val !== null &&
    typeof val === 'object' &&
    typeof (val as any).input === 'string' &&
    Array.isArray((val as any).prefixOptions) &&
    Array.isArray((val as any).suffixOptions) &&
    Array.isArray((val as any).videoFilters) &&
    Array.isArray((val as any).audioFilters) &&
    Array.isArray((val as any).tempFiles) &&
    typeof (val as any).reset === 'function' &&
    typeof (val as any).createTempFile === 'function' &&
    typeof (val as any).cleanup === 'function'
  );
};

export const videoSchema = z.custom<VideoData>(isVideoInstance, {
  message: 'Invalid video (Video instance expected)',
});
