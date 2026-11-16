import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { dbConnectionSchema } from '@tipeline/types';
import { orTemplateString } from '../templateValidation';

const connId = () => z.string().min(1);

export const meta = {
  label: 'Database',
  icon: 'Database'
}

export const validations = {
  connect: createValidationPair(
    {
      // At runtime we already have a parsed configuration object
      runtime: z.object({
        configuration: z.object({}).passthrough(),
      }),
      creation: z.object({
        configuration: orTemplateString(z.record(z.any())),
      }),
    },
    {
      label: 'Connect', icon: '🛢️', category: 'database', description: 'Open a database connection.',
      returns: 'dbConnection',
      fieldConfig: {
        configuration: { description: 'Database configuration object or reference string (host, port, credentials, database name, etc.).' },
      },
    }
  ),

  query: createValidationPair(
    {
      runtime: z.object({
        connection: dbConnectionSchema,
        sql: z.string().min(1),
        bindings: z.array(z.any()).optional(),
      }),
      creation: z.object({
        connection: connId(),
        sql: z.string().min(1),
        bindings: orTemplateString(z.array(z.any())).optional(),
      }),
    },
    {
      label: 'Query', icon: '🧾', category: 'database', description: 'Run a SQL statement.',
      returns: 'array',
      fieldConfig: {
        connection: { description: 'The active database connection object.' },
        sql: { component: 'codemirror', language: 'sql', description: 'SQL statement to execute (SELECT, INSERT, UPDATE, DELETE, etc.). Use `?` placeholders for any value that comes from a variable, and pass that value through `bindings` instead of substituting it into this string directly — that keeps it safely parameterized instead of interpolated as raw SQL text.' },
        bindings: { description: 'Values to bind to the `?` placeholders in `sql`, in order. Prefer this over embedding {{ }}/{= =} template values directly into `sql`.' },
      },
    }
  ),

  close: createValidationPair(
    {
      runtime: z.object({
        connection: dbConnectionSchema,
      }),
      creation: z.object({
        connection: connId(),
      }),
    },
    {
      label: 'Close', icon: '🔒', category: 'database', description: 'Close a database connection.',
      fieldConfig: {
        connection: { description: 'The active database connection to close.' },
      },
    }
  ),
};
