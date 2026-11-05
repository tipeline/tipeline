import { z } from 'zod';

export const hubSchema = z.object({
  name: z
    .string({
      required_error: 'hub.name.required',
      invalid_type_error: 'hub.name.invalid',
    })
    .min(1, 'hub.name.required'),
  type: z.enum(['remote', 'local_folder'], {
    required_error: 'hub.type.required',
    invalid_type_error: 'hub.type.invalid',
  }),
  target: z
    .string({
      required_error: 'hub.target.required',
      invalid_type_error: 'hub.target.invalid',
    })
    .min(1, 'hub.target.required'),
  /** Remote hubs only: sent as `Authorization: Bearer <token>` to the hub's own host. */
  token: z.string().optional(),
});

export const hubCreationSchema = hubSchema;

export const hubUpdateSchema = hubSchema.partial().extend({ token: z.string().nullable().optional() });
