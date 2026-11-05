import { z } from 'zod';
import { createValidationPair } from './../createValidation';

export const meta = {
  label: 'Subtask',
  icon: 'ListTree',
};

export const validations = {
  exec: createValidationPair(
    {
      runtime: z.object({
        identifier: z.string().optional(),
        path: z.string().optional(),
        props: z.record(z.unknown()).optional(),
        outputs: z.record(z.string()).optional(),
        async: z.boolean().optional(),
      }),
      creation: z.object({
        identifier: z.string().optional(),
        path: z.string().optional(),
        props: z.record(z.unknown()).optional(),
        outputs: z.record(z.string()).optional(),
        async: z.boolean().optional(),
      }),
    },
    {
      label: 'Subtask Execution',
      icon: 'ListTree',
      category: 'subtask',
      color: 'violet',
      description:
        'Run a child task inline and wait for it to finish. Pass values in via props and pull results back via outputs. ' +
        'Set async to start the child task in the background and continue immediately — async subtasks cannot use outputs.',
      returns: 'any',
      fieldConfig: {
        identifier: {
          component: 'task-select',
          description: 'Identifier of the child task to execute.',
        },
        path: { description: 'File path to the child task definition (alternative to identifier).' },
        props: { description: 'Key-value pairs passed as input variables to the child task.' },
        outputs: { description: 'Mapping of child task output variable names to local variable names.' },
        async: {
          description:
            'Run the child task in the background without waiting for it to finish. The parent continues immediately. ' +
            'Cannot be combined with outputs, since the child has not produced a result yet when the parent moves on.',
        },
      },
    }
  ),
};
