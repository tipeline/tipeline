<script setup lang="ts">
import { ref, computed } from 'vue';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { toast } from 'vue-sonner';
import { useI18n } from 'vue-i18n';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from '@/components/ui/form';
import {
  createFormSchema,
  NON_EDITABLE_FIELD_TYPES,
  isExternallySourced,
  type FormFieldConfig,
} from '@tipeline/schemas';
import VariableComponent from '@/components/variable/VariableComponent.vue';
import { LockIcon } from 'lucide-vue-next';

// Types that need the full width when the form shows two columns.
const WIDE_FIELD_TYPES = ['array', 'object'];

// All types handled by VariableComponent (date → DateInput, string → StringInput, etc.)
const VARIABLE_COMPONENT_TYPES = ['string', 'number', 'boolean', 'array', 'object', 'date'] as const;

const props = withDefaults(
  defineProps<{
    fields: FormFieldConfig[];
    showCancel?: boolean;
    /** Marks fields beside their label: filled in for the user, or still needed from them. */
    highlight?: Record<string, 'filled' | 'missing'>;
    /** Puts short fields side by side when the form is wide enough; lists and objects keep the full width. */
    columns?: boolean;
    /** Visibilities left off the form. The Assistant's run card shows protected ones too. */
    hiddenVisibilities?: readonly string[];
  }>(),
  {
    showCancel: false,
    highlight: () => ({}),
    columns: false,
    hiddenVisibilities: () => ['private', 'protected'],
  }
);

const emit = defineEmits<{
  submit: [data: any];
  close: any;
}>();

const { t } = useI18n();
const submitButtonRef = ref<HTMLButtonElement | null>(null);

const visibleFields = computed(() =>
  props.fields.filter(
    (f) =>
      !(NON_EDITABLE_FIELD_TYPES as readonly string[]).includes(f.type) &&
      !props.hiddenVisibilities.includes(f.visibility ?? 'private') &&
      !f.output
  )
);

const formSchema = createFormSchema(props.fields);

const { handleSubmit, setFieldValue, values } = useForm({
  validationSchema: toTypedSchema(formSchema),
  initialValues: Object.fromEntries(
    props.fields
      .filter((f) => !(NON_EDITABLE_FIELD_TYPES as readonly string[]).includes(f.type))
      .map((f) => [f.name, f.value ?? undefined])
  ),
});

// Parse JSON strings back to native arrays/objects so Zod validation passes.
function handleUpdate(field: FormFieldConfig, val: any) {
  if (typeof val === 'string' && (field.type === 'array' || field.type === 'object')) {
    try {
      setFieldValue(field.name, JSON.parse(val));
      return;
    } catch {
      // Invalid JSON — store as-is and let validation report the error.
    }
  }
  setFieldValue(field.name, val);
}

const onSubmit = handleSubmit(
  (data) => {
    emit('submit', data);
  },
  () => {
    toast.error(t('common.fixFormErrors'));
  }
);

function triggerSubmit() {
  submitButtonRef.value?.click();
}

defineExpose({ submit: triggerSubmit });
</script>

<template>
  <div class="space-y-4" :class="{ '@container': columns }">
    <form
      @submit="onSubmit"
      :class="columns ? 'grid gap-x-4 gap-y-6 @xl:grid-cols-2' : 'space-y-6'"
      novalidate
    >
      <FormField
        v-for="field in visibleFields"
        :key="field.name"
        :name="field.name"
      >
        <FormItem :class="{ '@xl:col-span-2': columns && WIDE_FIELD_TYPES.includes(field.type) }">
          <FormLabel class="flex items-center gap-1.5">
            {{ field.label || field.name }}
            <span
              v-if="isExternallySourced(field)"
              class="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground"
            >
              <LockIcon class="w-3 h-3" />
              {{ field.valueFromEnv ? `env: ${field.valueFromEnv}` : `global: ${field.valueFromGlobal}` }}
            </span>
            <span
              v-if="highlight[field.name] === 'filled'"
              class="ml-auto text-[11px] font-normal text-primary"
            >
              {{ t('agent.proposal.fromRequest') }}
            </span>
            <span
              v-else-if="highlight[field.name] === 'missing'"
              class="ml-auto text-[11px] font-normal text-amber-600 dark:text-amber-400"
            >
              {{ t('agent.proposal.needed') }}
            </span>
          </FormLabel>
          <FormControl>
            <div
              v-if="isExternallySourced(field)"
              class="text-sm text-muted-foreground italic px-3 py-2 rounded-md border bg-muted/40"
            >
              {{ field.secret ? '•••••••• (configured elsewhere)' : 'Resolved automatically — not editable here' }}
            </div>
            <fieldset v-else :disabled="field.readonly === true" class="border-0 p-0 m-0">
              <VariableComponent
                v-if="(VARIABLE_COMPONENT_TYPES as readonly string[]).includes(field.type)"
                :type="(field.type as any)"
                :model-value="values[field.name]"
                :secret="field.secret"
                @update:model-value="handleUpdate(field, $event)"
              />
            </fieldset>
          </FormControl>
          <FormDescription v-if="field.description">{{ field.description }}</FormDescription>
          <FormMessage />
        </FormItem>
      </FormField>
      <button ref="submitButtonRef" type="submit" class="hidden" />
    </form>
  </div>
</template>
