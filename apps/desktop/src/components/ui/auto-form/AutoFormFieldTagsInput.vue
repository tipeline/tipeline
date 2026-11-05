<script setup lang="ts">
import type { FieldProps } from './interface';
import { useI18n } from 'vue-i18n';
import { FormControl, FormDescription, FormField, FormItem, FormMessage } from '@/components/ui/form';
import TagsField from '@/components/tag/TagsField.vue';
import AutoFormLabel from './AutoFormLabel.vue';
import { beautifyObjectName } from './utils';

const props = defineProps<FieldProps>();
const { t } = useI18n();
</script>

<template>
  <FormField v-slot="{ componentField }" :name="fieldName">
    <FormItem v-bind="$attrs">
      <AutoFormLabel v-if="!config?.hideLabel" :required="required">
        {{ config?.label || beautifyObjectName(label ?? fieldName) }}
      </AutoFormLabel>
      <FormControl>
        <TagsField
          :model-value="componentField.modelValue ?? []"
          :placeholder="t('tasks.form.tagPlaceholder')"
          @update:model-value="componentField['onUpdate:modelValue']?.($event)"
        />
      </FormControl>
      <FormDescription v-if="config?.description">
        {{ config.description }}
      </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
