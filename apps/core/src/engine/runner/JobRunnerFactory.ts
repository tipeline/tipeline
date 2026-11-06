import fs from 'fs';
import path from 'path';
import os from 'os';
import { BreeRunner } from '@engine/runner/BreeRunner.js';
import { BullMQRunner } from '@engine/runner/BullMQRunner.js';
import type { IJobRunner } from '@engine/runner/IJobRunner.js';

interface RunnerConfig {
  runner?: 'bree' | 'bullmq';
  redis?: string;
  concurrency?: number;
}

const CONFIG_PATH = path.join(os.homedir(), '.tipeline', 'config.json');

let instance: IJobRunner | null = null;

function loadConfig(): RunnerConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) as RunnerConfig;
    }
  } catch (err) {
    console.error('[JobRunnerFactory] Failed to parse runner config, using default:', err);
  }
  return {};
}

export function initJobRunner(overrides?: RunnerConfig): IJobRunner {
  const config = { ...loadConfig(), ...overrides };

  if (config.runner === 'bullmq') {
    if (!config.redis) throw new Error('BullMQ runner requires a "redis" URL in ~/.tipeline/config.json');
    instance = new BullMQRunner(config.redis, config.concurrency ?? 4);
  } else {
    instance = new BreeRunner(config.concurrency ?? 10);
  }

  return instance;
}

export function getJobRunner(): IJobRunner {
  if (!instance) throw new Error('JobRunner not initialized. Call initJobRunner() first.');
  return instance;
}
