<script setup lang="ts">
import { computed } from 'vue';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { z } from 'zod';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { coreValidations } from '@tipeline/schemas';
import VariableComponent from './VariableComponent.vue';

type TypeOption = (typeof coreValidations.varObject.typeOptions)[number];

interface FieldDefinition {
  type: TypeOption;
  name: string;
  value: any;
  label?: string; // Optional custom label, defaults to name
}

interface Props {
  fields: FieldDefinition[];
  submitLabel?: string;
}

const props = withDefaults(defineProps<Props>(), {
  submitLabel: 'Submit',
});

// Create dynamic Zod schema based on fields
const formSchema = computed(() => {
  const schemaShape: Record<string, z.ZodTypeAny> = {};

  props.fields.forEach((field) => {
    // Get the appropriate schema for each field type
    const fieldSchema = coreValidations.varObject.createSchema(field.type);

    // Extract just the value schema from the full schema
    // The createSchema returns a schema with { name, type, value }
    // We only need the value part for each field
    schemaShape[field.name] = (fieldSchema as any).shape.value;
  });

  return toTypedSchema(z.object(schemaShape));
});

// Create initial values from field definitions
const initialValues = computed(() => {
  const values: Record<string, any> = {};
  props.fields.forEach((field) => {
    values[field.name] = field.value;
  });
  return values;
});

const { handleSubmit, values } = useForm({
  validationSchema: formSchema,
  initialValues: initialValues.value,
});

const emit = defineEmits<{
  submit: [values: Record<string, any>];
}>();

const onSubmit = handleSubmit((formValues) => {
  console.log('Form submitted:', formValues);
  emit('submit', formValues);
});
</script>

<template>
  <div class="w-full space-y-6">
    <form @submit="onSubmit" class="space-y-6">
      <!-- Dynamic Fields -->
      <FormField
        v-for="field in fields"
        :key="field.name"
        v-slot="{ componentField }"
        :name="field.name"
      >
        <FormItem>
          <FormLabel>{{ field.label || field.name }}</FormLabel>
          <FormControl>
            <VariableComponent
              :type="field.type"
              :model-value="componentField.modelValue"
              @update:model-value="componentField['onUpdate:modelValue']"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <Button type="submit">{{ submitLabel }}</Button>
    </form>
  </div>
</template>
