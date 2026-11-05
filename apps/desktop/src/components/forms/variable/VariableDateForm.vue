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
import { Button } from '@/components/ui/button';
import DateInput from '@/components/variable/inputs/DateInput.vue';

const props = defineProps<{
  name?: string;
  variables?: any;
  selectedVariable?: any;
}>();

const emit = defineEmits<{
  'update:name': [value: string];
  onSubmit: [value: any];
}>();

const { onSubmit, setFieldValue, values } = useVariableForm({
  props,
  emit,
  valueSchema: z.string().min(1, 'A date is required.'),
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
    <FormField name="value">
      <FormItem class="flex flex-col">
        <FormLabel>Date & Time</FormLabel>
        <FormControl>
          <DateInput
            :model-value="values.value"
            @update:model-value="(v) => setFieldValue('value', v)"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <Button type="submit"> Save Changes </Button>
  </form>
</template>
