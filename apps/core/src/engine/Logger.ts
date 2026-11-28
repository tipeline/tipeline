import path from 'path';
import { homedir } from 'os';
import { inspect } from 'util';
import fs from 'fs-extra';
import { createStream } from 'rotating-file-stream';

const logsDir = path.join(homedir(), '.tipeline', 'logs');
fs.ensureDirSync(logsDir);

const stream = createStream('start.log', {
  path: logsDir,
  size: '10M',
  maxFiles: 5,
  compress: 'gzip',
});

stream.on('error', (err) => {
  process.stderr.write(`[Logger] failed to write to start.log: ${err.stack ?? err}\n`);
});

function format(level: string, args: unknown[]): string {
  const message = args
    .map((arg) => (typeof arg === 'string' ? arg : inspect(arg, { depth: 4 })))
    .join(' ');
  return `[${new Date().toISOString()}] [${level}] ${message}\n`;
}

// `tipeline start --foreground` sets this, so Docker and systemd see the log too.
const toStdout = process.env.TIPELINE_LOG_STDOUT === '1';

/** For the last words before process.exit: the stream would lose them. */
export function logSync(level: string, ...args: unknown[]): void {
  const line = format(level, args);
  fs.appendFileSync(path.join(logsDir, 'start.log'), line);
  if (toStdout) fs.writeSync(1, line);
}

(['log', 'info', 'warn', 'error', 'debug'] as const).forEach((level) => {
  console[level] = (...args: unknown[]) => {
    const line = format(level.toUpperCase(), args);
    stream.write(line);
    if (toStdout) process.stdout.write(line);
  };
});
