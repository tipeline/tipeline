<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { CalendarClockIcon, FilePenLineIcon, TriangleAlert } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { renderMarkdown } from '@/utils/appMarkdown';
import type { AgentTurn } from '@/store/agentStore';
import { useScheduleText } from '@/composables/useScheduleText';

/**
 * The draft the assistant saved: what it does, what's left to do, and the way to the builder.
 * An incomplete draft (the user agreed to leave parts out) says so first, with what it doesn't do.
 */
const props = defineProps<{ turn: AgentTurn }>();

const { t } = useI18n();
const router = useRouter();

const draft = computed(() => props.turn.draft!);
const summaryHtml = computed(() => renderMarkdown(draft.value.summary ?? ''));
const showWarnings = ref(false);
const incomplete = computed(() => draft.value.incomplete ?? []);
const { describe } = useScheduleText();

function openBuilder() {
  router.push(`/tasks/${draft.value.identifier}/edit`);
}
</script>

<template>
  <div class="rounded-md border text-sm">
    <div class="flex items-start gap-2 px-3 py-2 border-b">
      <FilePenLineIcon class="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium">{{ draft.name }}</span>
          <span class="text-[11px] border border-amber-500/40 text-amber-700 dark:text-amber-400 rounded-full px-2 py-0.5">
            {{ incomplete.length > 0 ? t('agent.draft.incompleteBadge') : t('agent.draft.badge') }}
          </span>
        </div>
        <p class="text-xs text-muted-foreground">
          {{ incomplete.length > 0 ? t('agent.draft.savedIncomplete') : t('agent.draft.saved') }}
        </p>
      </div>
    </div>

    <div class="px-3 py-3 space-y-3">
      <div
        v-if="incomplete.length > 0"
        class="rounded-md border border-amber-500/40 bg-amber-500/5 px-2.5 py-2 text-xs space-y-1"
      >
        <p class="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
          <TriangleAlert class="w-3.5 h-3.5 shrink-0" />
          {{ t('agent.draft.notIncluded') }}
        </p>
        <ul class="list-disc pl-4 space-y-0.5">
          <li v-for="(part, i) in incomplete" :key="i" class="break-words">{{ part }}</li>
        </ul>
      </div>

      <!-- eslint-disable-next-line vue/no-v-html -- sanitized in renderMarkdown -->
      <div v-if="draft.summary" class="app-markdown text-sm" v-html="summaryHtml" />

      <div v-if="draft.todos.length > 0" class="space-y-1">
        <p class="text-xs font-medium">{{ t('agent.draft.todos') }}</p>
        <ul class="list-disc pl-4 text-xs space-y-0.5">
          <li v-for="(todo, i) in draft.todos" :key="i" class="break-words">{{ todo }}</li>
        </ul>
      </div>

      <div v-if="draft.schedule" class="flex items-start gap-1.5 text-xs" data-testid="drafted-schedule">
        <CalendarClockIcon class="w-3.5 h-3.5 mt-px shrink-0 text-muted-foreground" />
        <p>
          <span class="font-medium">{{ t('agent.draft.schedule') }}:</span> {{ describe(draft.schedule) }}
          <span class="block text-muted-foreground">{{ t('agent.draft.scheduleNote') }}</span>
        </p>
      </div>

      <div v-if="draft.warnings.length > 0" class="text-xs">
        <button class="text-muted-foreground hover:text-foreground" @click="showWarnings = !showWarnings">
          {{ t('agent.draft.warnings', { count: draft.warnings.length }) }}
        </button>
        <ul v-if="showWarnings" class="mt-1 list-disc pl-4 text-muted-foreground space-y-0.5">
          <li v-for="(warning, i) in draft.warnings" :key="i" class="break-words">{{ warning }}</li>
        </ul>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2 px-3 py-2 border-t">
      <Button size="sm" @click="openBuilder">{{ t('agent.draft.openBuilder') }}</Button>
      <span class="text-[11px] text-muted-foreground">{{ t('agent.draft.howToFinish') }}</span>
    </div>
  </div>
</template>
