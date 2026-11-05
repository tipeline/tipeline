<script setup lang="ts">
import { ref } from 'vue';
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
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/sonner';
import { useErrorT } from '@/composables/useErrorT';
import { tagCreationSchema } from '@tipeline/schemas';
import type { TagItem } from '@/config/tables/TagsList';
import { tagInput } from '@/utils/taskTags';

const { t } = useI18n();
const { translateError } = useErrorT();

const props = defineProps<{
  mode?: 'create' | 'edit';
  initialData?: TagItem;
}>();

const emit = defineEmits<{ close: [] }>();

const isSaving = ref(false);
const submitButtonRef = ref<HTMLButtonElement | null>(null);

const { handleSubmit } = useForm({
  validationSchema: toTypedSchema(tagCreationSchema),
  initialValues: {
    label: props.initialData?.label ?? '',
  },
});

const onSubmit = handleSubmit(async (values) => {
  isSaving.value = true;
  try {
    if (props.mode === 'edit') {
      await invokeCore(SEND.TAG_RENAME, { id: props.initialData?.id, label: values.label });
    } else {
      await invokeCore(SEND.TAG_NEW, { label: values.label });
    }
    emit('close');
  } catch (e: any) {
    toast.error(t('tag.saveFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isSaving.value = false;
  }
});

function triggerSubmit() {
  submitButtonRef.value?.click();
}

defineExpose({ submit: triggerSubmit, isSaving });
</script>

<template>
  <div class="w-full space-y-5">
    <form @submit="onSubmit" class="space-y-5">
      <FormField v-slot="{ componentField }" name="label">
        <FormItem>
          <FormLabel>{{ t('tag.form.label') }}</FormLabel>
          <FormControl>
            <Input
              type="text"
              :placeholder="t('tag.form.labelPlaceholder')"
              v-bind="componentField"
              @input="tagInput"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <button ref="submitButtonRef" type="submit" class="hidden" />
    </form>
  </div>
</template>
