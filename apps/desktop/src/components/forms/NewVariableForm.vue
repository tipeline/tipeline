<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
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
import VariableComponent from '@/components/variable/VariableComponent.vue';
import ScrollFade from '@/components/ui/ScrollFade.vue';
import { parseLenientJsonObject } from '@/utils/lenientJson';

const { typeOptions, createSchema } = coreValidations.varObject;
type TypeOption = (typeof typeOptions)[number];

const props = defineProps<{ variables?: any }>();

const emit = defineEmits<{
  onSubmit: [value: any];
  close: [];
}>();

const { t } = useI18n();
const submitButtonRef = ref<HTMLButtonElement | null>(null);
const selectedType = ref<TypeOption>('string');
const booleanValue = ref(false);
const isSecret = ref(false);
const isReadonly = ref(false);
const isOutput = ref(false);
const visibility = ref('private');

const formSchema = computed(() => {
  const baseSchema = createSchema(selectedType.value) as z.ZodTypeAny;
  return toTypedSchema(
    baseSchema.superRefine((data: any, ctx) => {
      const existingNames = new Set((props.variables ?? []).map((v: any) => v.name));
      if (existingNames.has(data.name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['name'],
          message: t('variable.form.nameDuplicate'),
        });
      }
    })
  );
});

const { handleSubmit, setFieldValue } = useForm({
  validationSchema: formSchema,
  initialValues: {
    type: 'string',
    name: '',
    label: '',
    description: '',
    value: '',
  },
});

watch(selectedType, (newType) => {
  setFieldValue('type', newType);
  if (newType === 'boolean') {
    booleanValue.value = false;
    setFieldValue('value', false as any);
  } else {
    setFieldValue('value', '' as any);
  }
});

const onSubmit = handleSubmit((values) => {
  const rawValue = (values as any).value;
  let value: any;

  const trimmedRaw = typeof rawValue === 'string' ? rawValue.trim() : rawValue;

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

  emit('onSubmit', { name: values.name, type: values.type, label: values.label || undefined, value, description: values.description || undefined, secret: isSecret.value, readonly: isReadonly.value, visibility: visibility.value, output: isOutput.value || undefined });
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
            <Input type="text" :placeholder="t('variable.form.namePlaceholder')" v-bind="componentField" />
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
          <Select v-model="selectedType">
            <FormControl>
              <SelectTrigger>
                <SelectValue :placeholder="t('variable.form.typePlaceholder')" />
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

      <FormField v-slot="{ value: fieldValue }" name="value">
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
