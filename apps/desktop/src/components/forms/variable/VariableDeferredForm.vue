<script setup lang="ts">
import { watch, computed } from 'vue';
import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import * as z from 'zod';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const props = defineProps<{
  name?: string;
  variables?: any;
  selectedVariable?: any;
  typeLabel?: string;
}>();

const emit = defineEmits<{
  'update:name': [value: string];
  onSubmit: [value: any];
}>();

const excludedNames = computed(() => props.variables?.map((v: any) => v.name) || []);

const nameSchema = z
  .string()
  .min(2)
  .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
    message:
      'Name must start with a letter or underscore, and contain only letters, numbers, and underscores',
  });

const nameWithValidation = props.selectedVariable
  ? nameSchema
  : nameSchema.refine((val) => !excludedNames.value.includes(val), {
      message: 'This name already exists',
    });

const form = useForm({
  validationSchema: toTypedSchema(z.object({ name: nameWithValidation })),
  initialValues: { name: props.selectedVariable?.name || props.name || '' },
});

watch(() => props.selectedVariable, (sv) => {
  if (sv) form.setValues({ name: sv.name || '' });
});

watch(
  () => form.values.name,
  (newName) => {
    if (newName !== undefined) emit('update:name', newName);
  }
);

const onSubmit = form.handleSubmit((values) => {
  emit('onSubmit', values);
});
</script>

<template>
  <form class="w-2/3 space-y-6" @submit="onSubmit">
    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel>Name</FormLabel>
        <FormControl>
          <Input
            type="text"
            placeholder=""
            v-bind="componentField"
            :disabled="!!selectedVariable"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <div class="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
      <p class="font-medium">Runtime-only value</p>
      <p class="mt-1 opacity-80">
        {{ typeLabel || 'This variable type' }} values are created and managed at runtime by workflow
        actions. No initial value can be set manually.
      </p>
    </div>

    <Button type="submit">Save Changes</Button>
  </form>
</template>
