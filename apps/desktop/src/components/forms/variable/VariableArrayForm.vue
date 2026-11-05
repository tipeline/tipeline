<script setup lang="ts">
import { watch } from 'vue';
import * as z from 'zod';
import { useVariableForm } from '@/composables/useVariableForm';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

const props = defineProps<{
  name?: string;
  variables?: any;
  selectedVariable?: any;
}>();

const emit = defineEmits<{
  'update:name': [value: string];
  onSubmit: [value: any];
}>();

const jsonArraySchema = z
  .string()
  .min(1, 'Value is required')
  .transform((val, ctx) => {
    try {
      const parsed = JSON.parse(val);
      if (!Array.isArray(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be a JSON array' });
        return z.NEVER;
      }
      return parsed;
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be valid JSON' });
      return z.NEVER;
    }
  });

const { onSubmit, setFieldValue } = useVariableForm({
  props,
  emit,
  valueSchema: jsonArraySchema,
});

function initJsonValue(val: any) {
  if (val !== undefined && val !== null && Array.isArray(val)) {
    setFieldValue('value', JSON.stringify(val, null, 2) as any);
  }
}

initJsonValue(props.selectedVariable?.value);

watch(() => props.selectedVariable, (sv) => {
  if (sv) initJsonValue(sv.value);
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

    <FormField v-slot="{ componentField }" name="value">
      <FormItem>
        <FormLabel>Value (JSON Array)</FormLabel>
        <FormControl>
          <Textarea
            placeholder='["item1", "item2"]'
            class="min-h-32 font-mono text-sm"
            v-bind="componentField"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <Button type="submit">Save Changes</Button>
  </form>
</template>
