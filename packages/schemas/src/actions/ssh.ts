import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { sshSchema } from '@tipeline/types';

const connId = () => z.string().min(1);

export const meta = {
  label: 'SSH',
  icon: 'Terminal',
};

export const validations = {
  connect: createValidationPair(
    {
      runtime: z.object({
        config: z.object({}).passthrough(),
      }),
      creation: z.object({
        config: z.union([z.string(), z.object({}).passthrough()]),
      }),
    },
    {
      label: 'Connect', icon: '🔌', category: 'ssh', description: 'Open an SSH connection.',
      returns: 'sshConnection',
      fieldConfig: { config: { description: 'SSH connection configuration object or reference (host, port, user, private key, etc.).' } },
    }
  ),
  exec: createValidationPair(
    {
      runtime: z.object({
        connection: sshSchema,
        command: z.string().min(1),
      }),
      creation: z.object({
        connection: connId(),
        command: z.string().min(1),
      }),
    },
    {
      label: 'Exec', icon: '🖥️', category: 'ssh', description: 'Execute a command over SSH.',
      returns: 'object',
      fieldConfig: {
        connection: { description: 'The active SSH connection object.' },
        command: { description: 'Shell command to execute on the remote host.' },
      },
    }
  ),
  close: createValidationPair(
    {
      runtime: z.object({
        connection: sshSchema,
      }),
      creation: z.object({
        connection: connId(),
      }),
    },
    {
      label: 'Close', icon: '🔒', category: 'ssh', description: 'Close an SSH connection.',
      fieldConfig: { connection: { description: 'The active SSH connection to close.' } },
    }
  ),
};
