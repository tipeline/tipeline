<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import {
  CAPABILITY_ICON,
  capabilityKey,
  stepNames,
  type CapabilityReport,
} from '@/utils/capabilities';

/**
 * "This workflow can:" — shown before installing someone else's workflow. Review
 * capabilities (programs, servers, file changes, add-on code) are highlighted.
 */
defineProps<{ report: CapabilityReport; heading?: string }>();

const { t } = useI18n();
const inWorkflow = (workflow: string) =>
  t('capabilities.inWorkflow', { workflow });
</script>

<template>
  <div class="space-y-2 text-sm">
    <div class="font-medium">{{ heading ?? t('capabilities.thisCan') }}</div>
    <div class="rounded-md border divide-y overflow-hidden">
      <div
        v-for="entry in report.capabilities"
        :key="entry.capability"
        class="flex items-start gap-2.5 px-3 py-2"
        :class="entry.review ? 'bg-amber-500/5' : ''"
      >
        <component
          :is="CAPABILITY_ICON[entry.capability]"
          class="size-4 mt-0.5 shrink-0"
          :class="
            entry.review
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground'
          "
        />
        <div class="min-w-0">
          <div class="font-medium">
            {{ t(`capabilities.can.${capabilityKey(entry.capability)}`) }}
          </div>
          <div class="text-xs text-muted-foreground break-words">
            {{
              t(
                'capabilities.steps',
                {
                  count: entry.steps.length,
                  list: stepNames(entry.steps, inWorkflow),
                },
                entry.steps.length
              )
            }}
          </div>
        </div>
      </div>
    </div>
    <p
      v-if="report.unknownWorkflows.length > 0"
      class="text-xs text-muted-foreground"
    >
      {{
        t('capabilities.unknownWorkflows', {
          list: report.unknownWorkflows.join(', '),
        })
      }}
    </p>
  </div>
</template>
