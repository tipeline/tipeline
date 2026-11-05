import { claimCorePidFile, releaseCorePidFile } from '@tipeline/utils/coreProcess';
import { logSync } from './Logger';

// Imported right after the Logger, before anything heavy: a second Core has to leave
// before it opens the database, starts the schedules or takes over the IPC socket.
const claim = claimCorePidFile();
if (!claim.claimed) {
  logSync('WARN', `Core is already running (PID ${claim.pid}), this one is exiting.`);
  process.exit(0);
}

// Every exit that gets to run code passes here. A hard kill leaves the file behind, which
// CLI and Desktop recognize as stale.
process.on('exit', () => releaseCorePidFile());
