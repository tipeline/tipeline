<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
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
import { coreValidations } from '@tipeline/schemas';
import VariableComponent from './VariableComponent.vue';
import ScrollFade from '@/components/ui/ScrollFade.vue';

const { t } = useI18n();
const { globalTypeOptions, createGlobalSchema } = coreValidations.varObject;
type TypeOption = (typeof globalTypeOptions)[number];

const typeLabels = computed<Partial<Record<TypeOption, string>>>(() => ({
  workbook: t('variable.form.types.workbook'),
  oauthToken: t('variable.form.types.oauthToken'),
  audio: t('variable.form.types.audio'),
  video: t('variable.form.types.video'),
}));

const deferredTypes = new Set<TypeOption>(['workbook', 'oauthToken', 'audio', 'video']);

const props = defineProps<{
  mode?: 'create' | 'edit';
  initialData?: {
    name: string;
    identifier: string;
    type: string | null;
    value: any;
    description?: string;
    secret?: boolean;
    readonly?: boolean;
  };
}>();

const emit = defineEmits<{ close: [] }>();

const submitButtonRef = ref<HTMLButtonElement | null>(null);
const selectedType = ref<TypeOption>(
  (props.initialData?.type as TypeOption) ?? 'string'
);

const isSecret = ref<boolean>(!!props.initialData?.secret);
const isReadonly = ref<boolean>(!!props.initialData?.readonly);
const booleanValue = ref<boolean>(
  props.initialData?.type === 'boolean' ? Boolean(props.initialData?.value) : false
);


const formSchema = computed(() => toTypedSchema(createGlobalSchema(selectedType.value)));

const getInitialValue = () => {
  const raw = props.initialData?.value;
  const t = props.initialData?.type;
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
    name: props.initialData?.name ?? '',
    description: props.initialData?.description ?? '',
    secret: false,
    value: getInitialValue(),
  },
});

watch(selectedType, (newType) => {
  setFieldValue('type', newType);
  if (newType === 'boolean') {
    booleanValue.value = false;
    setFieldValue('value', false as any);
  } else if (!deferredTypes.has(newType)) {
    setFieldValue('value', '' as any);
  }
});

const onSubmit = handleSubmit(async (values) => {
  const ipcChannel = props.mode === 'edit' ? SEND.VARIABLE_EDIT : SEND.VARIABLE_NEW;
  const rawValue = (values as any).value;
  const trimmedRaw = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

  let value: any;

  if (deferredTypes.has(values.type as TypeOption)) {
    value = null;
  } else if (values.type === 'boolean') {
    value = booleanValue.value;
  } else if (values.type === 'object') {
    if (!trimmedRaw) {
      value = undefined;
    } else {
      try {
        const str = rawValue as string;
        const normalized = str.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3');
        value = JSON.parse(normalized);
      } catch {
        value = rawValue;
      }
    }
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

  const messageData: any = {
    name: values.name,
    description: values.description || undefined,
    type: values.type,
    value,
    secret: isSecret.value,
    readonly: isReadonly.value,
  };

  if (props.mode === 'edit') {
    messageData.identifier = props.initialData?.identifier;
  }

  await invokeCore(ipcChannel, messageData);
  emit('close');
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
            <Input type="text" :placeholder="t('variable.form.namePlaceholder')" v-bind="componentField" :disabled="mode === 'edit'" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="description">
        <FormItem>
          <FormLabel>{{ t('variable.form.description') }} <span class="text-muted-foreground text-xs">{{ t('common.optional') }}</span></FormLabel>
          <FormControl>
            <Textarea :placeholder="t('variable.form.descriptionPlaceholder')" rows="2" v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField name="type">
        <FormItem>
          <FormLabel>{{ t('variable.form.type') }}</FormLabel>
          <Select v-model="selectedType" :disabled="mode === 'edit'">
            <FormControl>
              <SelectTrigger>
                <SelectValue :placeholder="t('variable.form.typePlaceholder')" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem v-for="option in globalTypeOptions" :key="option" :value="option">
                {{ typeLabels[option] ?? option }}
              </SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      </FormField>

      <div v-if="deferredTypes.has(selectedType)" class="rounded-lg border border-dashed p-3">
        <p class="text-sm text-muted-foreground">
          <span class="font-medium text-foreground">{{ typeLabels[selectedType] ?? selectedType }}</span> {{ t('variable.form.deferredValueHint') }}
        </p>
      </div>

      <FormField v-else v-slot="{ value: fieldValue }" name="value">
        <FormItem>
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

      <button ref="submitButtonRef" type="submit" class="hidden" />
    </form>
  </div>
</template>

