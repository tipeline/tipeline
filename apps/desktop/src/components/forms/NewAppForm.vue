<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { coreValidations } from '@tipeline/schemas';
import { invokeCore } from '@/utils/invoke';
import { setAppFileTrust } from '@/utils/appOpen';
import { SEND } from '@/ipc-channels';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import MarkdownTextarea from '@/components/forms/MarkdownTextarea.vue';
import ProjectSelect from '@/components/project/ProjectSelect.vue';
import { useNewItemDefaults } from '@/composables/useNewItemDefaults';

const props = withDefaults(
  defineProps<{
    /** The project it starts in (the one it's created from); the user can change it. */
    project?: string | null;
  }>(),
  { project: null }
);
const emit = defineEmits<{ created: [] }>();

const router = useRouter();
const { t } = useI18n();
const isWaiting = ref(false);
const submitButtonRef = ref<HTMLButtonElement | null>(null);
const selectedProject = ref(props.project ?? '__none__');
// The dialog may stay mounted between openings; follow where it was opened from.
watch(() => props.project, (project) => (selectedProject.value = project ?? '__none__'));

// No version field: core always stamps a new app as 1.0.0 (see Core.appNew).
const formSchema = toTypedSchema(
  coreValidations.appObject.appMetaCreationSchema
    .pick({ name: true, description: true })
    // Optional and may be left empty (the shared schema rejects an empty author).
    .extend({ author: z.string().optional() })
);

const { handleSubmit } = useForm({
  validationSchema: formSchema,
  initialValues: { name: '', description: '', author: useNewItemDefaults().author() },
});

// Core creates the initial source (one empty page) and stamps version 1.0.0.
const onSubmit = handleSubmit(async (values) => {
  isWaiting.value = true;
  try {
    const response = await invokeCore(SEND.APP_NEW, {
      data: {
        name: values.name,
        description: values.description,
        author: values.author || undefined,
        metadata: {},
      },
    });
    // An app you create may use files anywhere on this computer (installed ones start
    // limited to ~/Tipeline — see the app's Edit dialog, File access).
    await setAppFileTrust(response.identifier, true);
    if (selectedProject.value !== '__none__') {
      await invokeCore(SEND.PROJECT_ASSIGN_APP, {
        projectIdentifier: selectedProject.value,
        appIdentifier: response.identifier,
      });
    }
    emit('created');
    // Overview first, then the builder, so the builder's back arrow lands on the new
    // app's overview instead of wherever the dialog was opened from.
    await router.push({ name: 'AppDetail', params: { aid: response.identifier } });
    router.push({ name: 'AppEdit', params: { aid: response.identifier } });
  } finally {
    isWaiting.value = false;
  }
});

// The Create button lives in the dialog footer, outside the <form>.
function triggerSubmit() {
  submitButtonRef.value?.click();
}

defineExpose({ submit: triggerSubmit, isWaiting });
</script>

<template>
  <form @submit="onSubmit" class="space-y-4">
    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel>
          {{ t('apps.form.name') }}<span class="text-destructive"> *</span>
        </FormLabel>
        <FormControl>
          <Input type="text" :placeholder="t('apps.form.namePlaceholder')" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="description">
      <FormItem>
        <FormLabel>
          {{ t('apps.form.description') }}<span class="text-destructive"> *</span>
        </FormLabel>
        <FormControl>
          <MarkdownTextarea
            :placeholder="t('apps.form.descriptionPlaceholder')"
            v-bind="componentField"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="author">
      <FormItem>
        <FormLabel>
          {{ t('apps.form.author') }}
          <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span>
        </FormLabel>
        <FormControl>
          <Input type="text" :placeholder="t('apps.form.authorPlaceholder')" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <ProjectSelect v-model="selectedProject" />

    <button ref="submitButtonRef" type="submit" class="hidden" />
  </form>
</template>
