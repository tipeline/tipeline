<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { coreValidations, isExternallySourced } from '@tipeline/schemas';
import VariableComponent from '@/components/variable/VariableComponent.vue';
import ScrollFade from '@/components/ui/ScrollFade.vue';
import { parseLenientJsonObject } from '@/utils/lenientJson';
import { LockIcon } from 'lucide-vue-next';

const { typeOptions, createSchema } = coreValidations.varObject;
type TypeOption = (typeof typeOptions)[number];

const props = defineProps<{
  variables?: any;
  selectedVariable: any;
}>();

const emit = defineEmits<{
  onSubmit: [value: any];
  close: [];
}>();

const { t } = useI18n();
const submitButtonRef = ref<HTMLButtonElement | null>(null);
const selectedType = ref<TypeOption>((props.selectedVariable?.type as TypeOption) ?? 'string');

const booleanValue = ref<boolean>(
  props.selectedVariable?.type === 'boolean' ? Boolean(props.selectedVariable?.value) : false
);
const isSecret = ref<boolean>(!!props.selectedVariable?.secret);
const isReadonly = ref<boolean>(!!props.selectedVariable?.readonly);
const isOutput = ref<boolean>(!!props.selectedVariable?.output);
const visibility = ref<string>(props.selectedVariable?.visibility ?? 'private');

// Variables sourced from env/global vars are resolved by the engine — their
// value can't be set here, so the value field is dropped from validation.
const isExternal = computed(() => isExternallySourced(props.selectedVariable ?? {}));

// Which key to look up is still editable even though the resolved value
// isn't — e.g. pointing an env-sourced variable at a different env var name.
const isFromEnv = computed(() => !!props.selectedVariable?.valueFromEnv);
const sourceKeyName = ref<string>(
  props.selectedVariable?.valueFromEnv ?? props.selectedVariable?.valueFromGlobal ?? ''
);

const formSchema = computed(() => {
  const schema = createSchema(selectedType.value);
  if (isExternal.value && 'shape' in schema && 'value' in schema.shape) {
    return toTypedSchema((schema as any).omit({ value: true }));
  }
  return toTypedSchema(schema);
});

const getInitialValue = () => {
  const raw = props.selectedVariable?.value;
  const t = props.selectedVariable?.type;
  if (raw == null) return '';
  if (t === 'boolean') return false;
  if ((t === 'object' || t === 'array') && typeof raw !== 'string') {
    return JSON.stringify(raw, null, 2);
  }
  return raw;
};

const { handleSubmit, setFieldValue } = useForm({
  validationSchema: formSchema,
  initialValues: {
    type: selectedType.value,
    name: props.selectedVariable?.name ?? '',
    label: props.selectedVariable?.label ?? '',
    description: props.selectedVariable?.description ?? '',
    value: getInitialValue(),
  },
});

const onSubmit = handleSubmit((values) => {
  const payload: any = {
    name: values.name,
    type: values.type,
    label: values.label || undefined,
    description: values.description || undefined,
    secret: isSecret.value,
    readonly: isReadonly.value,
    visibility: visibility.value,
    // undefined drops the key when the parent merges, so unticking clears it.
    output: isOutput.value || undefined,
  };

  // Externally-sourced variables have no editable value here — leave it
  // untouched so the merge in the parent preserves the existing definition.
  // The source key name (which env/global var to look up) is still editable.
  if (isExternal.value) {
    if (isFromEnv.value) {
      payload.valueFromEnv = sourceKeyName.value;
    } else {
      payload.valueFromGlobal = sourceKeyName.value;
    }
  } else {
    const rawValue = (values as any).value;
    const trimmedRaw = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    let value: any;

    if (values.type === 'boolean') {
      value = booleanValue.value;
    } else if (values.type === 'object') {
      value = trimmedRaw ? (parseLenientJsonObject(rawValue as string) ?? rawValue) : undefined;
    } else if (values.type === 'array') {
      const str = (rawValue as string).trim();
      try {
        value = JSON.parse(str);
      } catch {
        value = str.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    } else if (values.type === 'date') {
      value = trimmedRaw ? rawValue : undefined;
    } else {
      value = rawValue;
    }

    payload.value = value;
  }

  emit('onSubmit', payload);
});

function triggerSubmit() {
  submitButtonRef.value?.click();
}

defineExpose({ submit: triggerSubmit });
</script>

<template>
  <div class="w-full space-y-5">
    <form @submit="onSubmit" class="space-y-5">
      <FormField v-slot="{ componentField }" name="name">
        <FormItem>
          <FormLabel>{{ t('variable.form.name') }}</FormLabel>
          <FormControl>
            <Input type="text" :placeholder="t('variable.form.namePlaceholder')" v-bind="componentField" disabled />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="label">
        <FormItem>
          <FormLabel>
            {{ t('variable.form.label') }}
            <span class="text-muted-foreground text-xs">{{ t('common.optional') }}</span>
          </FormLabel>
          <FormControl>
            <Input type="text" :placeholder="t('variable.form.labelPlaceholder')" v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField name="type">
        <FormItem>
          <FormLabel>{{ t('variable.form.type') }}</FormLabel>
          <Select v-model="selectedType" disabled>
            <FormControl>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem v-for="option in typeOptions" :key="option" :value="option">
                {{ option }}
              </SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-if="isExternal" name="sourceKeyName">
        <FormItem>
          <FormLabel class="flex items-center gap-1.5">
            <LockIcon class="w-3 h-3 text-muted-foreground" />
            {{ isFromEnv ? 'Environment variable name' : 'Global variable name' }}
          </FormLabel>
          <FormControl>
            <Input type="text" v-model="sourceKeyName" required />
          </FormControl>
        </FormItem>
      </FormField>

      <FormField v-slot="{ value: fieldValue }" name="value">
        <FormItem v-if="isExternal">
          <FormLabel>{{ t('variable.form.value') }}</FormLabel>
          <FormControl>
            <div class="text-sm text-muted-foreground italic px-3 py-2 rounded-md border bg-muted/40">
              {{ isSecret ? '•••••••• (configured elsewhere)' : 'Resolved automatically — not editable here' }}
            </div>
          </FormControl>
        </FormItem>

        <FormItem v-else>
          <FormLabel>{{ t('variable.form.value') }}</FormLabel>
          <FormControl>
            <div v-if="selectedType === 'boolean'" class="flex items-center space-x-2">
              <input
                type="checkbox"
                :checked="booleanValue"
                class="h-4 w-4 cursor-pointer"
                @change="(e) => { booleanValue = (e.target as HTMLInputElement).checked; }"
              />
              <span class="text-sm">{{ t('variable.form.trueLabel') }}</span>
            </div>
            <ScrollFade v-else>
              <VariableComponent
                :type="selectedType"
                :model-value="fieldValue"
                :secret="isSecret"
                @update:model-value="(v) => setFieldValue('value', v)"
              />
            </ScrollFade>
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="description">
        <FormItem>
          <FormLabel>
            {{ t('variable.form.description') }}
            <span class="text-muted-foreground text-xs">{{ t('common.optional') }}</span>
          </FormLabel>
          <FormControl>
            <Textarea :placeholder="t('variable.form.descriptionPlaceholder')" rows="2" class="resize-none" v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <div class="flex items-center justify-between rounded-lg border p-3">
        <div>
          <label class="text-sm font-medium">{{ t('variable.form.secret') }}</label>
          <p class="text-xs text-muted-foreground">{{ t('variable.form.secretDescription') }}</p>
        </div>
        <input
          type="checkbox"
          :checked="isSecret"
          class="h-4 w-4 cursor-pointer"
          @change="(e) => { isSecret = (e.target as HTMLInputElement).checked; }"
        />
      </div>

      <div class="flex items-center justify-between rounded-lg border p-3">
        <div>
          <label class="text-sm font-medium">{{ t('variable.form.readOnly') }}</label>
          <p class="text-xs text-muted-foreground">{{ t('variable.form.readOnlyDescription') }}</p>
        </div>
        <input
          type="checkbox"
          :checked="isReadonly"
          class="h-4 w-4 cursor-pointer"
          @change="(e) => { isReadonly = (e.target as HTMLInputElement).checked; }"
        />
      </div>

      <div class="flex items-center justify-between rounded-lg border p-3">
        <div>
          <label class="text-sm font-medium">{{ t('variable.form.output') }}</label>
          <p class="text-xs text-muted-foreground">{{ t('variable.form.outputDescription') }}</p>
        </div>
        <input
          type="checkbox"
          :checked="isOutput"
          class="h-4 w-4 cursor-pointer"
          @change="(e) => { isOutput = (e.target as HTMLInputElement).checked; }"
        />
      </div>

      <div class="space-y-1.5">
        <label class="text-sm font-medium">{{ t('variable.form.visibility') }}</label>
        <Select v-model="visibility">
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">{{ t('variable.form.public') }}</SelectItem>
            <SelectItem value="protected">{{ t('variable.form.protected') }}</SelectItem>
            <SelectItem value="private">{{ t('variable.form.private') }}</SelectItem>
          </SelectContent>
        </Select>
        <p class="text-xs text-muted-foreground">{{ t(`variable.form.${visibility}Description`) }}</p>
        <p v-if="isOutput && visibility === 'private'" class="text-xs text-amber-600 dark:text-amber-400">
          {{ t('variable.form.outputPrivateWarning') }}
        </p>
      </div>

      <button ref="submitButtonRef" type="submit" class="hidden" />
    </form>
  </div>
</template>
