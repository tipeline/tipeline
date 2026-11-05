import { z } from 'zod';
import { createValidationPair } from './../createValidation';

export const meta = {
  label: 'Script',
  icon: 'Code'
}

export const validations = {
  runScript: createValidationPair(
    {
      runtime: z.object({
        code: z.string().min(1, 'script.code.required'),
        context: z.record(z.any(), z.any()).optional(), // optional vars passed into the script
      }),
      creation: z.object({
        code: z.string().min(1, 'script.code.required'),
        context: z.record(z.any(), z.any()).optional(),
      }),
    },
    {
      label: 'Run Script',
      icon: '📜',
      category: 'script',
      description:
        'Run a short JavaScript snippet that computes a value from the variables passed in context and returns it. ' +
        'Plain JavaScript only, in a sandbox: no require or import (no Node.js modules such as fs, path or os), ' +
        'no process, no files, no network, no timers. Workflow variables are not visible unless passed in context. ' +
        'Use the file, folder, image, http and system actions for anything outside the script.',
      returns: 'any',
      fieldConfig: {
        code: {
          component: 'codemirror',
          description:
            'Plain JavaScript (the body of an async function): use return to give back the result. No require, import or process.',
          scriptPreview: true,
        },
        context: {
          description:
            'Values the script can use, by name, e.g. { items: \'{= items =}\' }. Only text, numbers, true/false, lists and objects.',
        },
      },
    }
  ),
};
