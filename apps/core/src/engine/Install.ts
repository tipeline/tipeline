#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import os from 'os';
import { DatabaseManager } from '@database/DatabaseManager';

const force = process.argv.includes('--force');

const tipelineDir = path.join(os.homedir(), 'Tipeline');
const configFilePath = path.join(tipelineDir, 'database.json');
const runnerConfigPath = path.join(tipelineDir, 'config.json');

if (fs.existsSync(configFilePath) && !force) {
  console.log(`Tipeline is already installed at ${tipelineDir}`);
  console.log(`Use --force to overwrite the existing configuration.`);
  process.exit(0);
}

const dirs = [
  tipelineDir,
  path.join(tipelineDir, '.database'),
  path.join(tipelineDir, 'logs'),
];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created: ${dir}`);
  }
}

const { migrations: _migrations, ...userConfig } = DatabaseManager.getDefaultConfig();
fs.writeFileSync(configFilePath, JSON.stringify(userConfig, null, 2), 'utf-8');
console.log(`Configuration written to: ${configFilePath}`);

if (!fs.existsSync(runnerConfigPath) || force) {
  const runnerConfig = { runner: 'bree', concurrency: 10 };
  fs.writeFileSync(runnerConfigPath, JSON.stringify(runnerConfig, null, 2), 'utf-8');
  console.log(`Configuration written to: ${runnerConfigPath}`);
}

console.log(`\nEdit if needed, then run: tipeline start`);
