<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useQuery } from '@/composables/useQuery';
import { SEND } from '@/ipc-channels';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// A project identifier, or '__none__' for no project (Select can't hold an empty value).
const model = defineModel<string>({ required: true });

const { t } = useI18n();
const { data: projects } = useQuery(SEND.PROJECT_LIST);
</script>

<template>
  <div class="space-y-1.5">
    <label class="text-sm font-medium">
      {{ t('tasks.form.project') }}
      <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span>
    </label>
    <Select v-model="model">
      <SelectTrigger class="w-full">
        <SelectValue :placeholder="t('tasks.form.projectPlaceholder')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">{{ t('tasks.form.projectPlaceholder') }}</SelectItem>
        <SelectItem
          v-for="project in projects ?? []"
          :key="project.identifier"
          :value="project.identifier"
        >
          {{ project.name }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
