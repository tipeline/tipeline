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
  valueSchema: z.number().min(1),
});
</script>

<template>
  <form class="w-2/3 space-y-6" @submit="onSubmit">
    <!-- Name -->
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

    <!-- Value Field -->
    <FormField v-slot="{ componentField }" name="value">
      <FormItem>
        <FormLabel>Value</FormLabel>
        <FormControl>
          <Input type="number" placeholder="" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <Button type="submit"> Save Changes </Button>
  </form>
</template>
