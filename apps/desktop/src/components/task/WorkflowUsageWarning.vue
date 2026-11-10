<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { TriangleAlert, LayoutGrid, Workflow, CalendarClock } from 'lucide-vue-next';
import { useWorkflowUsage, userLabel } from '@/composables/useWorkflowUsage';
import { useScheduleText } from '@/composables/useScheduleText';

// Shown in the delete dialogs: the apps and workflows that would lose this workflow,
// and the schedules that go with it. Only fetches while `identifier` is set, so pass
// null while the dialog is closed.
const props = defineProps<{ identifier: string | null }>();

const { t } = useI18n();
const { describe } = useScheduleText();
const { usage, used } = useWorkflowUsage(() => props.identifier);
</script>

<template>
  <div v-if="used" class="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
    <TriangleAlert class="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
    <div class="min-w-0 space-y-2">
      <div v-if="usage.apps.length > 0" class="space-y-1">
        <p>{{ t('tasks.deleteAlert.usedBy', usage.apps.length) }}</p>
        <ul class="text-xs text-muted-foreground space-y-0.5">
          <li v-for="app in usage.apps" :key="app.identifier" class="flex items-center gap-1.5 min-w-0">
            <LayoutGrid class="w-3 h-3 shrink-0" />
            <span
              v-for="project in app.projects ?? []"
              :key="project.identifier"
              class="w-2 h-2 rounded-full shrink-0"
              :style="{ backgroundColor: project.color || 'var(--muted-foreground)' }"
            />
            <span class="truncate">{{ userLabel(app) }}</span>
          </li>
        </ul>
      </div>
      <div v-if="usage.workflows.length > 0" class="space-y-1">
        <p>{{ t('tasks.deleteAlert.calledBy', usage.workflows.length) }}</p>
        <ul class="text-xs text-muted-foreground space-y-0.5">
          <li v-for="caller in usage.workflows" :key="caller.identifier" class="flex items-center gap-1.5 min-w-0">
            <Workflow class="w-3 h-3 shrink-0" />
            <span
              v-for="project in caller.projects ?? []"
              :key="project.identifier"
              class="w-2 h-2 rounded-full shrink-0"
              :style="{ backgroundColor: project.color || 'var(--muted-foreground)' }"
            />
            <span class="truncate">{{ userLabel(caller) }}</span>
          </li>
        </ul>
      </div>
      <div v-if="usage.schedules.length > 0" class="space-y-1">
        <p>{{ t('tasks.deleteAlert.schedules', usage.schedules.length) }}</p>
        <ul class="text-xs text-muted-foreground space-y-0.5">
          <li v-for="schedule in usage.schedules" :key="schedule.identifier" class="flex items-center gap-1.5 min-w-0">
            <CalendarClock class="w-3 h-3 shrink-0" />
            <span class="truncate">
              {{ describe({ cron: schedule.cron, runAt: schedule.run_at, everySeconds: schedule.every_seconds }) }}
              <template v-if="!schedule.enabled"> · {{ t('tasks.deleteAlert.schedulePaused') }}</template>
            </span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
