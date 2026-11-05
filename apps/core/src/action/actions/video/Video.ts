import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { generateIdentifier } from '@tipeline/utils';

export class Video {
  input: string = '';
  /** Each entry is one option with its values, as separate arguments. */
  prefixOptions: string[][] = [];
  suffixOptions: string[][] = [];
  videoFilters: string[] = [];
  audioFilters: string[] = [];
  tempFiles: string[] = [];

  reset(newInput: string) {
    this.input = newInput;
    this.prefixOptions = [];
    this.suffixOptions = [];
    this.videoFilters = [];
    this.audioFilters = [];
  }

  createTempFile(ext: string = '.mp4'): string {
    const tempDir = os.tmpdir();
    const filename = `tipeline-${generateIdentifier()}${ext}`;
    const fullPath = path.join(tempDir, filename);
    this.tempFiles.push(fullPath);
    return fullPath;
  }

  cleanup(): void {
    for (const file of this.tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (err) {
        console.warn(`Failed to delete temp file ${file}: ${err}`);
      }
    }
  }
}
