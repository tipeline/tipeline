<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  CAPABILITY_ICON,
  capabilityKey,
  type CapabilityReport,
} from '@/utils/capabilities';

/**
 * The Overview's "Can access" row: one neutral chip per capability; clicking a
 * chip lists the steps that cause it. `highlight` colors the review ones, for
 * places where someone is about to trust the workflow (a draft).
 */
defineProps<{ report: CapabilityReport; highlight?: boolean }>();

const { t } = useI18n();
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex flex-wrap gap-1.5">
      <Popover v-for="entry in report.capabilities" :key="entry.capability">
        <PopoverTrigger as-child>
          <button
            type="button"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors"
            :class="
              highlight && entry.review
                ? 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
            "
          >
            <component :is="CAPABILITY_ICON[entry.capability]" class="size-3" />
            {{ t(`capabilities.label.${capabilityKey(entry.capability)}`) }}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" class="w-72 p-3 text-xs space-y-1.5">
          <div class="font-medium text-sm">
            {{ t(`capabilities.label.${capabilityKey(entry.capability)}`) }}
          </div>
          <div class="text-muted-foreground">
            {{ t('capabilities.fromSteps', entry.steps.length) }}
          </div>
          <ul class="space-y-0.5 max-h-48 overflow-y-auto scroll-fade">
            <li
              v-for="(step, index) in entry.steps"
              :key="index"
              class="flex gap-1.5 min-w-0"
            >
              <span class="truncate">{{ step.label }}</span>
              <span v-if="step.workflow" class="text-muted-foreground truncate">
                ·
                {{ t('capabilities.inWorkflow', { workflow: step.workflow }) }}
              </span>
            </li>
          </ul>
        </PopoverContent>
      </Popover>
      <span
        v-if="report.capabilities.length === 0"
        class="text-sm"
      >
        {{ t('capabilities.onlyData') }}
      </span>
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
