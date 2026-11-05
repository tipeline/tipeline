<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { beautifyObjectName } from '@/components/ui/auto-form/utils';
import { Input } from '@/components/ui/input';
import MarkdownTextarea from '@/components/forms/MarkdownTextarea.vue';
import ProjectSelect from '@/components/project/ProjectSelect.vue';
import { useNewItemDefaults } from '@/composables/useNewItemDefaults';
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
import TagsField from '@/components/tag/TagsField.vue';

const props = withDefaults(
  defineProps<{
    /** Open the new workflow's builder once created (off when another form picks it). */
    navigate?: boolean;
    /** The project it starts in (the one it's created from); the user can change it. */
    project?: string | null;
  }>(),
  { navigate: true, project: null }
);
const emit = defineEmits<{ created: [identifier: string] }>();

const PLATFORM_OPTIONS = ['windows', 'linux', 'macos'] as const;

const router = useRouter();
const { t } = useI18n();
const isWaiting = ref(false);
const submitButtonRef = ref<HTMLButtonElement | null>(null);
const selectedProject = ref(props.project ?? '__none__');
// The dialog may stay mounted between openings; follow where it was opened from.
watch(() => props.project, (project) => (selectedProject.value = project ?? '__none__'));
const tags = ref<string[]>([]);
const defaults = useNewItemDefaults();

// Same fields and layout as the Edit Workflow Info dialog (TaskDetail.vue), minus the
// image (it needs an identifier) and version (a new workflow is always 1.0.0).
const { handleSubmit, setFieldValue, values: formValues } = useForm({
  validationSchema: toTypedSchema(
    z.object({
      name: z.string({ required_error: 'task.name.required' }).min(1, 'task.name.required'),
      description: z
        .string({ required_error: 'task.description.required' })
        .min(1, 'task.description.required'),
      author: z.string().optional(),
      platform: z.enum(PLATFORM_OPTIONS).optional(),
    })
  ),
  initialValues: { name: '', description: '', author: defaults.author() },
});

// Settings → Defaults may ask for this computer's platform; that answer comes from the
// main process, so it lands just after the form opens (unless one was already picked).
onMounted(async () => {
  const platform = await defaults.platform();
  if (platform && !formValues.platform) setFieldValue('platform', platform);
});

const onSubmit = handleSubmit(async (values) => {
  isWaiting.value = true;
  try {
    const data: Record<string, any> = {
      name: values.name,
      description: values.description,
      author: values.author || undefined,
      platform: values.platform || undefined,
      tags: tags.value.length ? [...tags.value] : undefined,
      version: '1.0.0',
    };
    const source = { ...data, pipeline: { variables: [], actions: [] } };
    data.source = JSON.stringify(source);
    data.metadata = {};
    const response = await invokeCore(SEND.TASK_NEW, { data });
    if (selectedProject.value && selectedProject.value !== '__none__') {
      await invokeCore(SEND.PROJECT_ASSIGN_TASK, {
        projectIdentifier: selectedProject.value,
        taskIdentifier: response.identifier,
      });
    }
    emit('created', response.identifier);
    if (!props.navigate) return;
    // Overview first, then the builder, so the builder's back arrow lands on the new
    // workflow's overview instead of wherever the dialog was opened from.
    await router.push({ name: 'TaskOverview', params: { tid: response.identifier } });
    router.push({ name: 'TaskEdit', params: { tid: response.identifier } });
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
  <form class="space-y-4" @submit="onSubmit">
    <FormField name="name" v-slot="{ componentField }">
      <FormItem>
        <FormLabel>
          {{ t('tasks.form.name') }}<span class="text-destructive"> *</span>
        </FormLabel>
        <FormControl>
          <Input :placeholder="t('tasks.form.namePlaceholder')" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField name="description" v-slot="{ componentField }">
      <FormItem>
        <FormLabel>
          {{ t('tasks.form.description') }}<span class="text-destructive"> *</span>
        </FormLabel>
        <FormControl>
          <MarkdownTextarea
            :placeholder="t('tasks.form.descriptionPlaceholder')"
            rows="3"
            class="max-h-40 overflow-y-auto"
            v-bind="componentField"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <div class="grid grid-cols-2 gap-4 items-start">
      <FormField name="author" v-slot="{ componentField }">
        <FormItem>
          <FormLabel>
            {{ t('tasks.form.author') }}
            <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span>
          </FormLabel>
          <FormControl>
            <Input :placeholder="t('tasks.form.authorPlaceholder')" v-bind="componentField" />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField name="platform" v-slot="{ componentField }">
        <FormItem>
          <FormLabel>
            {{ t('common.platform') }}
            <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span>
          </FormLabel>
          <Select v-bind="componentField">
            <FormControl>
              <SelectTrigger class="w-full">
                <SelectValue :placeholder="t('tasks.form.platformPlaceholder')" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              <SelectItem v-for="option in PLATFORM_OPTIONS" :key="option" :value="option">
                {{ beautifyObjectName(option) }}
              </SelectItem>
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      </FormField>
    </div>

    <ProjectSelect v-model="selectedProject" />

    <div class="space-y-1.5">
      <label class="text-sm font-medium">
        {{ t('tasks.form.tags') }}
        <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span>
      </label>
      <TagsField v-model="tags" :placeholder="t('tasks.form.tagPlaceholder')" />
    </div>

    <button ref="submitButtonRef" type="submit" class="hidden" />
  </form>
</template>
