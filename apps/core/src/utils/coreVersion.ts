import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export const CORE_VERSION: string = require('../../package.json').version;
