import { z } from 'zod';
import { createValidationPair } from './createValidation';
import { stepCacheSchema, workflowCacheSchema } from './cache';
import { normalizeTagLabels } from './Tag';

const semverRegex = /^\d+\.\d+\.\d+$/;

/**
 * Action shape (unchanged)
 */
export const actionShapeSchema = z.object({
  group: z
    .string({ required_error: 'action.group.required', invalid_type_error: 'action.group.invalid' })
    .min(1, 'action.group.required'),
  name: z
    .string({ required_error: 'action.name.required', invalid_type_error: 'action.name.invalid' })
    .min(1, 'action.name.required'),
  params: z.record(z.any(), z.any()).optional(),
  onError: z.enum(['throw', 'continue']).optional(),
  // Present only on plugin actions authored via the Desktop builder — lets a
  // plugin group safely share a name with a core group, since resolution no
  // longer has to guess which one a bare `group` string means.
  source: z.enum(['plugin']).optional(),
  // Reuse this step's result for a while when it runs again with the same params
  // (see cache.ts for which steps can).
  cache: stepCacheSchema.optional(),
});

/**
 * NEW: Task meta schema (only metadata, no pipeline/variables)
 */
export const taskMetaSchema = z.object({
  name: z
    .string({
      required_error: 'task.name.required',
      invalid_type_error: 'task.name.invalid',
    })
    .min(1, 'task.name.required'),
  description: z
    .string({
      required_error: 'task.description.required',
      invalid_type_error: 'task.description.invalid',
    })
    .min(1, 'task.description.required'),
  author: z
    .string({
      required_error: 'task.author.required',
      invalid_type_error: 'task.author.invalid',
    })
    .min(1, 'task.author.required')
    .optional(),
  version: z
    .string({
      required_error: 'task.version.required',
      invalid_type_error: 'task.version.invalid',
    })
    .regex(semverRegex, 'task.version.invalid')
    .optional(),
  platform: z
    .enum(['windows', 'linux', 'macos'], {
      required_error: 'task.platform.required',
      invalid_type_error: 'task.platform.invalid',
    })
    .optional(),
  // Lowercased and de-duplicated rather than rejected — see normalizeTagLabels.
  tags: z
    .array(z.string({ invalid_type_error: 'task.tags.item.invalid' }), {
      invalid_type_error: 'task.tags.invalid',
    })
    .transform(normalizeTagLabels)
    .optional(),
  // Relative path under `~/.tipeline` (e.g. "assets/tasks/<id>.png"), populated by the
  // image-upload IPC channel once the task already has an identifier — never submitted
  // directly by a form, hence omitted from taskMetaCreationSchema below.
  image: z.string().optional(),
});

/**
 * Full task schema reusing meta + pipeline
 */
export const taskSchema = taskMetaSchema.extend({
  // Reuse the workflow's outputs for a while when it's called again with the same
  // inputs (apps, sub-workflows). Set in the builder, not the create form.
  cache: workflowCacheSchema.optional(),
  // Run by other workflows for its data, never offered by the assistant as an answer
  // to a request. Drafts can still reuse it as a sub-workflow.
  helper: z.boolean({ invalid_type_error: 'task.helper.invalid' }).optional(),
  pipeline: z.object(
    {
      variables: z.array(z.record(z.any(), z.any())).optional(),
      actions: z.array(z.record(z.any(), z.any()), {
        required_error: 'task.actions.required',
        invalid_type_error: 'task.actions.invalid',
      }),
    },
    { required_error: 'task.pipeline.required', invalid_type_error: 'task.pipeline.invalid' }
  ),
});

export const taskMetaCreationFieldConfig = {
  description: {
    component: 'textarea' as const,
    inputProps: {
      style: 'height: 120px',
    },
  },
};
export const taskMetaCreationSchema = taskMetaSchema.omit({ version: true, image: true });
// export const taskMetaCreationSchema = taskMetaSchema;

const taskMetaRuntimeSchema = taskMetaSchema.omit({ version: true });
// const taskMetaRuntimeSchema = taskMetaSchema;
/**
 * Validations registry
 */
export const validations = {
  actionShape: createValidationPair(
    { runtime: actionShapeSchema, creation: actionShapeSchema },
    {
      label: 'Action Shape',
      icon: '🧩',
      category: 'schema',
      description: 'Validate a single pipeline action object.',
    }
  ),

  // NEW: validate only the task meta (for your form)
  taskMeta: createValidationPair(
    { runtime: taskMetaRuntimeSchema, creation: taskMetaRuntimeSchema },
    {
      label: 'Basic Information',
      icon: '📝',
      category: 'schema',
      description: `Define the basic metadata for your pipeline task. You'll configure the pipeline steps and variables in the next screen.`,
    }
  ),

  // Existing: validate the full task (meta + pipeline)
  task: createValidationPair(
    { runtime: taskSchema, creation: taskSchema },
    {
      label: 'Task Schema',
      icon: '📋',
      category: 'schema',
      description: 'Validate a full task definition (metadata + pipeline).',
    }
  ),
};
