/**
 * The error for a failed command-line tool. ffmpeg opens with a long banner and states the
 * problem last, and `ffprobe -v quiet` says nothing at all, so this keeps the last lines
 * or falls back to the command itself rather than an empty message.
 */
export function commandError(error: Error, stderr: string): Error {
  const lines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return new Error(lines.length ? lines.slice(-4).join('\n') : error.message);
}
