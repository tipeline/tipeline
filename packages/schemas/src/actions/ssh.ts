import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { sshSchema } from '@tipeline/types';
import { orTemplateString } from '../templateValidation';

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
        // A record (not string-first) so the builder shows Fields / Raw JSON / Variable.
        config: orTemplateString(z.record(z.any())),
      }),
    },
    {
      label: 'Connect', icon: '🔌', category: 'ssh', description: 'Open an SSH connection.',
      returns: 'sshConnection',
      fieldConfig: {
        config: {
          description: 'SSH connection settings (host, port, username, password or privateKeyPath, passphrase) as fields, JSON, or an object variable.',
          valueField: true,
          variableType: 'object',
        },
      },
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
        connection: {
          description: 'The active SSH connection object.',
          valueField: true,
          variableType: 'sshConnection',
        },
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
      fieldConfig: {
        connection: {
          description: 'The active SSH connection to close.',
          valueField: true,
          variableType: 'sshConnection',
        },
      },
    }
  ),
};
