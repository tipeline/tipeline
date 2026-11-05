import { z } from 'zod';

// Update the interface to include all Audio class properties and methods
export interface AudioData {
  input: string;
  prefixOptions: string[][];
  suffixOptions: string[][];
  audioFilters: string[];
  tempFiles: string[];
  format: string | null;

  // Include the methods
  reset(newInput: string): void;
  createTempFile(ext?: string): string;
  cleanup(): void;
}

// Update validation to check for Audio class instance specifically
export const isAudioInstance = (val: unknown): val is AudioData => {
  return (
    val !== null &&
    typeof val === 'object' &&
    typeof (val as any).input === 'string' &&
    Array.isArray((val as any).prefixOptions) &&
    Array.isArray((val as any).suffixOptions) &&
    Array.isArray((val as any).audioFilters) &&
    Array.isArray((val as any).tempFiles) &&
    (typeof (val as any).format === 'string' || (val as any).format === null) &&
    typeof (val as any).reset === 'function' &&
    typeof (val as any).createTempFile === 'function' &&
    typeof (val as any).cleanup === 'function'
  );
};

export const audioSchema = z.custom<AudioData>(isAudioInstance, {
  message: 'Invalid audio (Audio instance expected)',
});
