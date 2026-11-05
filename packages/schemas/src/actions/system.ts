import { z } from 'zod';
import { createValidationPair } from './../createValidation';

const pidSchema = z.union([z.number(), z.string().regex(/^\d+$/, 'system.pid.invalid')]);
const envSchema = z.record(z.string(), z.string()).or(z.literal('')).optional();
const runOptions = z.object({ shell: z.boolean().optional() }).optional();

export const meta = {
  label: 'System',
  icon: 'Settings'
}

export const validations = {
  message: createValidationPair(
    {
      runtime: z.object({ text: z.string().min(1) }),
      creation: z.object({ text: z.string().min(1) }),
    },
    {
      label: 'System Message', icon: '💬', category: 'system', description: 'Emit a system message.',
      fieldConfig: { text: { component: 'codemirror-template', description: 'Message text to emit.' } },
    }
  ),

  runApplication: createValidationPair(
    {
      runtime: z.object({
        command: z.string(),
        args: z.array(z.string()).optional(),
        env: envSchema,
        options: runOptions,
      }),
      creation: z.object({
        command: z.string(),
        args: z.array(z.string()).optional(),
        env: envSchema,
        options: runOptions,
      }),
    },
    {
      label: 'Run Application', icon: '🚀', category: 'system', description: 'Execute a command with optional args and env.',
      returns: 'string',
      fieldConfig: {
        command: { description: 'The executable or command to run.' },
        args: { description: 'List of command-line arguments to pass.' },
        env: { description: 'Environment variables to set for the process.' },
        options: { description: 'Execution options (e.g. shell: true to run in a shell).' },
      },
    }
  ),

  terminateProcess: createValidationPair(
    {
      runtime: z.object({
        pid: pidSchema,
        signal: z.enum(['SIGTERM', 'SIGKILL', 'SIGINT']).optional(),
      }),
      // At creation time pid may be a template expression (e.g. {{ pid }}),
      // so accept any string or number — runtime enforces the numeric constraint.
      creation: z.object({
        pid: z.union([z.number(), z.string()]),
        signal: z.enum(['SIGTERM', 'SIGKILL', 'SIGINT']).optional(),
      }),
    },
    {
      label: 'Terminate Process', icon: '🛑', category: 'system', description: 'Send a signal to terminate a process.',
      fieldConfig: {
        pid: { description: 'Process ID (PID) of the process to terminate.' },
        signal: { description: 'Signal to send: SIGTERM (graceful), SIGKILL (force), or SIGINT (interrupt).' },
      },
    }
  ),

  setEnvVariable: createValidationPair(
    {
      runtime: z.object({ key: z.string(), value: z.string() }),
      creation: z.object({ key: z.string(), value: z.string() }),
    },
    {
      label: 'Set Env Variable', icon: '🔧', category: 'system', description: 'Set an environment variable.',
      fieldConfig: {
        key: { description: 'Environment variable name.' },
        value: { description: 'Value to assign to the environment variable.' },
      },
    }
  ),

  getEnvVariable: createValidationPair(
    {
      runtime: z.object({ key: z.string() }),
      creation: z.object({ key: z.string() }),
    },
    {
      label: 'Get Env Variable', icon: '🔎', category: 'system', description: 'Read an environment variable.',
      returns: 'string',
      fieldConfig: { key: { description: 'Name of the environment variable to read.' } },
    }
  ),

  deleteEnvVariable: createValidationPair(
    {
      runtime: z.object({ key: z.string() }),
      creation: z.object({ key: z.string() }),
    },
    {
      label: 'Delete Env Variable', icon: '🗑️', category: 'system', description: 'Delete an environment variable.',
      fieldConfig: { key: { description: 'Name of the environment variable to delete.' } },
    }
  ),
};
