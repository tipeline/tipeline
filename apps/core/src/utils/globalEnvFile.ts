import os from 'os';
import path from 'path';

/**
 * The environment file every run reads (`{{ _env.KEY }}`, `valueFromEnv`). One place for the
 * path, so a run and the workflow cache always read the same file. Desktop shows it in
 * Settings → Environment (apps/desktop/electron/main/utils/envFile.ts).
 */
export const globalEnvFile = (): string => path.join(os.homedir(), '.tipeline', '.env');
