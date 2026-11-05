import { z } from 'zod';

export const projectSchema = z.object({
  name: z
    .string({
      required_error: 'project.name.required',
      invalid_type_error: 'project.name.invalid',
    })
    .min(1, 'project.name.required'),
  description: z
    .string({
      invalid_type_error: 'project.description.invalid',
    })
    .optional(),
  color: z
    .string({
      invalid_type_error: 'project.color.invalid',
    })
    .optional(),
  instructions: z
    .string({
      invalid_type_error: 'project.instructions.invalid',
    })
    .max(4000, 'project.instructions.tooLong')
    .optional(),
});

export const projectCreationSchema = projectSchema;

export const projectUpdateSchema = projectSchema.partial();
