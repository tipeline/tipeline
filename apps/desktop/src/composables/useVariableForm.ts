import { toTypedSchema } from '@vee-validate/zod';
import { useForm } from 'vee-validate';
import { watch, computed } from 'vue';
import * as z from 'zod';

interface UseVariableFormOptions {
  props: {
    name?: string;
    variables?: any;
    selectedVariable?: any;
  };
  emit: {
    (e: 'update:name', value: string): void;
    (e: 'onSubmit', value: any): void;
  };
  valueSchema: z.ZodTypeAny;
}

export function useVariableForm({
  props,
  emit,
  valueSchema,
}: UseVariableFormOptions) {
  const excludedNames = computed(
    () => props.variables?.map((variable: any) => variable.name) || []
  );

  const nameSchema = z
    .string()
    .min(2)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
      message:
        'Name must start with a letter or underscore, and contain only letters, numbers, and underscores',
    });

  const nameSchemaWithValidation = props.selectedVariable
    ? nameSchema
    : nameSchema.refine((val) => !excludedNames.value.includes(val), {
        message: 'This name already exists',
      });

  const formSchema = toTypedSchema(
    z.object({
      name: nameSchemaWithValidation,
      value: valueSchema,
    })
  );

  const form = useForm({
    validationSchema: formSchema,
    initialValues: {
      name: props.selectedVariable?.name || props.name || '',
      value: props.selectedVariable?.value ?? '',
    },
  });

  // Watch for selectedVariable changes
  watch(
    () => props.selectedVariable,
    (newVariable) => {
      if (newVariable) {
        form.setValues({
          name: newVariable.name || '',
          value: newVariable.value ?? '',
        });
      }
    }
  );

  // Watch for prop changes from parent
  watch(
    () => props.name,
    (newName) => {
      if (newName !== undefined && newName !== form.values.name) {
        form.setFieldValue('name', newName);
      }
    }
  );

  // Watch for changes to values.name to emit to parent
  watch(
    () => form.values.name,
    (newName) => {
      if (newName !== undefined) {
        emit('update:name', newName);
      }
    }
  );

  const onSubmit = form.handleSubmit((values) => {
    console.log('Submit', JSON.stringify(values, null, 2));
    emit('onSubmit', values);
  });

  return {
    ...form,
    onSubmit,
  };
}
