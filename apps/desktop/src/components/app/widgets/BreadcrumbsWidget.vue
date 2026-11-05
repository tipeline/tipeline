<script setup lang="ts">
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronRight, House } from 'lucide-vue-next';
import { APP_PAGE_GRID } from '../appCanvasKey';

// Where you are, as a trail: "Orders › Acme › #A-1042". A step that names a `page` of the
// app (and its `params`) is a link: a click goes there — the same as a Navigate action. A
// step without a page is plain text (it has nowhere to go), and so is the last one: where
// you are. Labels may be bindings ("#{{ page.params.id }}").
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const { t } = useI18n();
const pageGrid = inject(APP_PAGE_GRID, null);

type Step = { label?: unknown; page?: string; params?: Record<string, unknown>; icon?: string };
const steps = computed<Step[]>(() =>
  (Array.isArray(props.props.items) ? props.props.items : []).filter((s: unknown) => s && typeof s === 'object')
);
const label = (s: Step) => (s.label === undefined || s.label === null || s.label === '' ? s.page ?? '' : String(s.label));

// A link: not the last step (where you are), and it has a page to go to.
const isLink = (step: Step, index: number) => index < steps.value.length - 1 && !!step.page;
function open(step: Step) {
  if (props.editable || !step.page) return;
  void pageGrid?.runtime.runActions([{ type: 'navigate', page: step.page, ...(step.params ? { params: step.params } : {}) }]);
}
</script>

<template>
  <nav class="h-full flex items-center px-(--app-pad) min-w-0" :aria-label="t('apps.breadcrumbs.label')" data-testid="breadcrumbs">
    <ol class="m-0 p-0 list-none flex w-full items-center gap-1 min-w-0 text-sm">
      <!-- Earlier steps give way first; where you are keeps at least 60% of the room. -->
      <li v-for="(step, i) in steps" :key="i" class="flex items-center gap-1 min-w-0" :class="i < steps.length - 1 ? 'shrink' : 'shrink-0 max-w-[60%]'">
        <ChevronRight v-if="i > 0" class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span v-if="i === steps.length - 1" class="font-medium truncate" aria-current="page" data-testid="crumb-current">
          {{ label(step) }}
        </span>
        <!-- no page to go to: plain text -->
        <span v-else-if="!isLink(step, i)" class="flex items-center gap-1 min-w-0 text-muted-foreground" data-crumb-text>
          <House v-if="i === 0 && props.props.homeIcon" class="size-3.5 shrink-0" />
          <span class="truncate">{{ label(step) }}</span>
        </span>
        <button
          v-else
          type="button"
          class="flex items-center gap-1 min-w-0 rounded px-1 -mx-1 text-muted-foreground hover:text-foreground hover:underline underline-offset-2 disabled:no-underline disabled:hover:text-muted-foreground"
          :disabled="editable"
          data-crumb
          @click="open(step)"
        >
          <House v-if="i === 0 && props.props.homeIcon" class="size-3.5 shrink-0" />
          <span class="truncate">{{ label(step) }}</span>
        </button>
      </li>
    </ol>
    <span v-if="!steps.length" class="text-xs text-muted-foreground">{{ t('apps.breadcrumbs.empty') }}</span>
  </nav>
</template>
