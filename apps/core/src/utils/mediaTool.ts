import { execFile } from 'child_process';
import { commandError } from '@utils/commandError';

// ffmpeg can log a lot over a long video; running out of this ends the process.
const MAX_OUTPUT = 64 * 1024 * 1024;

/**
 * Runs ffmpeg or ffprobe without a shell, so a value from a workflow input (a path, a
 * timestamp…) is only ever one argument, never something a shell would interpret.
 */
export function runMediaTool(tool: 'ffmpeg' | 'ffprobe', args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(tool, args, { maxBuffer: MAX_OUTPUT }, (error, stdout, stderr) => {
      if (error) return reject(commandError(error, String(stderr)));
      resolve(String(stdout));
    });
  });
}

/** A file named last on the command line: a leading "-" would read as an option. */
export const fileArg = (file: string): string => (file.startsWith('-') ? `./${file}` : file);

/**
 * A value inside a filter, so it can't end the value or add filters of its own. ffmpeg reads
 * it twice, as the filter's option and then as part of the filtergraph, so both are escaped.
 */
export const escapeFilterValue = (value: string): string =>
  value.replace(/[\\':]/g, '\\$&').replace(/[\\'[\],;]/g, '\\$&');
