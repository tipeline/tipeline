<script setup lang="ts">
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
import { Checkbox } from '@/components/ui/checkbox';
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

const { onSubmit } = useVariableForm({
  props,
  emit,
  valueSchema: z.boolean().default(false).optional(),
});
</script>

<template>
  <form class="w-2/3 space-y-6" @submit="onSubmit">
    <!-- Name -->
    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel>Name</FormLabel>
        <FormControl>
          <Input type="text" placeholder="" v-bind="componentField" />
        </FormControl>

        <FormMessage />
      </FormItem>
    </FormField>

    <!-- Value Field -->
    <FormField v-slot="{ componentField, value, handleChange }" name="value">
      <FormItem>
        <FormLabel>Value</FormLabel>
        <FormControl>
          <Checkbox :model-value="value" @update:model-value="handleChange" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <Button type="submit"> Save Changes </Button>
  </form>
</template>
