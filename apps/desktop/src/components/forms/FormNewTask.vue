<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { h } from 'vue';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const schema = z.object({
  version: z.string().min(1, 'task.version.required'),
  // .meta({ description: 'Version number of the task' }),

  name: z.string().min(1, 'task.name.required'),
  // .meta({ description: 'The display name of the task' }),

  author: z.string().min(1, 'task.author.required'),
  // .meta({ description: 'Name of the task creator' }),

  description: z
    .string()
    .min(2, 'task.description.required')
    .max(50, 'task.description.invalid'),
  // .meta({ description: 'Short description of the task' }),
});

/** 1) Strong form value type from the schema */
type FormValues = z.infer<typeof schema>;
const formSchema = toTypedSchema(schema);

const { handleSubmit } = useForm({
  validationSchema: formSchema,
});

const onSubmit = handleSubmit((values) => {
  console.log('values', values);
});

const shape: z.ZodRawShape = schema.shape;
</script>

<template>
  <form class="space-y-6 max-w-[700px]" @submit="onSubmit">
    <FormField
      v-for="[fieldName, fieldSchema] in Object.entries(shape)"
      :key="fieldName"
      :name="fieldName"
      v-slot="{ componentField }"
    >
      <FormItem>
        <FormLabel>{{ fieldName }}</FormLabel>
        <FormControl>
          <Input type="text" v-bind="componentField" />
        </FormControl>
        <FormDescription>
          {{ (fieldSchema as any).meta()?.description || '' }}
        </FormDescription>
        <FormMessage />
      </FormItem>
    </FormField>
    <Button type="submit"> Save Changes </Button>
  </form>
</template>
