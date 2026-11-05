<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import { projectCreationSchema } from '@tipeline/schemas';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import MarkdownTextarea from '@/components/forms/MarkdownTextarea.vue';
import InstructionsTextarea from '@/components/agent/InstructionsTextarea.vue';

const props = defineProps<{
  initialData?: {
    identifier?: string;
    name?: string;
    description?: string;
    color?: string;
    instructions?: string | null;
  } | null;
}>();

const emit = defineEmits<{ close: [] }>();

const { t } = useI18n();
const isEditing = !!props.initialData?.identifier;
const isWaiting = ref(false);
const submitButtonRef = ref<HTMLButtonElement | null>(null);

const formSchema = toTypedSchema(projectCreationSchema);

const { handleSubmit } = useForm({
  validationSchema: formSchema,
  initialValues: {
    name: props.initialData?.name ?? '',
    description: props.initialData?.description ?? '',
    color: props.initialData?.color ?? '#6366f1',
    instructions: props.initialData?.instructions ?? '',
  },
});

const onSubmit = handleSubmit(async (values) => {
  isWaiting.value = true;
  try {
    if (isEditing) {
      await invokeCore(SEND.PROJECT_UPDATE, {
        identifier: props.initialData!.identifier,
        data: {
          name: values.name,
          description: values.description || undefined,
          color: values.color || undefined,
          // Emptied on purpose: clear them, not keep the old ones.
          instructions: values.instructions?.trim() || null,
        },
      });
    } else {
      await invokeCore(SEND.PROJECT_NEW, {
        name: values.name,
        description: values.description || undefined,
        color: values.color || undefined,
        instructions: values.instructions?.trim() || undefined,
      });
    }
    emit('close');
  } finally {
    isWaiting.value = false;
  }
});

function triggerSubmit() {
  submitButtonRef.value?.click();
}

defineExpose({ submit: triggerSubmit, isWaiting, isEditing });
</script>

<template>
  <div class="w-full max-w-md space-y-6">
    <form @submit="onSubmit" class="space-y-4">
      <FormField v-slot="{ componentField }" name="name">
        <FormItem>
          <FormLabel>{{ t('projects.form.name') }}</FormLabel>
          <FormControl>
            <Input type="text" :placeholder="t('projects.form.namePlaceholder')" v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="description">
        <FormItem>
          <FormLabel>
            {{ t('projects.form.description') }}
            <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span>
          </FormLabel>
          <FormControl>
            <MarkdownTextarea :placeholder="t('projects.form.descriptionPlaceholder')" v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ field }" name="color">
        <FormItem>
          <FormLabel>
            {{ t('projects.form.color') }}
            <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span>
          </FormLabel>
          <FormControl>
            <div class="flex items-center gap-3">
              <input
                type="color"
                :value="field.value"
                @change="field.onChange"
                @blur="field.onBlur"
                class="w-10 h-10 rounded cursor-pointer border border-input bg-transparent p-1"
              />
              <span class="text-sm text-muted-foreground">{{ field.value }}</span>
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="instructions">
        <FormItem>
          <FormLabel>
            {{ t('projects.form.instructions') }}
            <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span>
          </FormLabel>
          <p class="text-xs text-muted-foreground">{{ t('projects.form.instructionsHint') }}</p>
          <FormControl>
            <InstructionsTextarea :placeholder="t('projects.form.instructionsPlaceholder')" v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <button ref="submitButtonRef" type="submit" class="hidden" />
    </form>
  </div>
</template>
