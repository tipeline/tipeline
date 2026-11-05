<script setup lang="ts">
import { computed, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { APP_CANVAS, APP_PAGE_GRID } from '../appCanvasKey';
import { isShown } from './visibility';

// A row of tabs, each with its own 12-column grid; children name the tab in
// `parent.tab`. The open tab is `<componentId>.activeTab`. In the builder, switching
// tabs only changes which tab is being edited.
//
// With `display: steps` the same tabs are a wizard: numbered steps, Back / Next and
// Finish (the `finish` event) on the last. Next and Finish go through the runtime's
// checkStep first; earlier steps reopen from the header, later ones only via Next.
// In the builder every step opens and the buttons just page through them.
//
// With `display: accordion` they are sections stacked under each other: a header per
// section, and the open one fills the rest of the box. One is always open (the box
// keeps its size, so none open would only leave it empty).
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
}>();

const canvas = inject(APP_CANVAS, null);
const pageGrid = inject(APP_PAGE_GRID, null);
const { t } = useI18n();
const visible = computed(() => isShown(props.props.visible, props.editable));

const tabs = computed<Array<{ id: string; label: string }>>(() =>
  Array.isArray(props.props.tabs)
    ? props.props.tabs.filter((tab: any) => tab && typeof tab.id === 'string')
    : []
);

const active = computed(() => {
  const id = props.editable
    ? canvas?.editorTab?.(props.componentId)
    : props.state?.activeTab;
  return tabs.value.some((tab) => tab.id === id) ? id : tabs.value[0]?.id;
});

function open(id: string) {
  if (props.editable) canvas?.setEditorTab?.(props.componentId, id);
  else if (id !== active.value) emit('event', 'change', { activeTab: id });
}

const steps = computed(() => props.props.display === 'steps');
const accordion = computed(() => props.props.display === 'accordion');
const index = computed(() => tabs.value.findIndex((tab) => tab.id === active.value));
const isLast = computed(() => index.value === tabs.value.length - 1);

// Whether the step passes its checks (always, in the builder).
const stepOk = () =>
  props.editable || !active.value || (pageGrid?.runtime.checkStep(props.componentId, active.value) ?? true);

function back() {
  if (index.value > 0) open(tabs.value[index.value - 1].id);
}

function next() {
  if (!stepOk()) return;
  if (!isLast.value) open(tabs.value[index.value + 1].id);
  else if (!props.editable) emit('event', 'finish');
}

// Steps before the current one reopen from the header; later ones need Next.
const reachable = (i: number) => props.editable || i <= index.value;
</script>

<template>
  <div v-if="visible && steps" class="h-full flex flex-col min-h-0">
    <ol class="flex items-center gap-2 px-(--app-pad) py-3 border-b shrink-0 overflow-x-auto m-0 list-none">
      <li
        v-for="(tab, i) in tabs"
        :key="tab.id"
        class="flex items-center gap-2 min-w-0"
        :class="i < tabs.length - 1 && 'flex-1'"
      >
        <button
          type="button"
          class="flex items-center gap-2 min-w-0 rounded-md text-sm disabled:cursor-default"
          :disabled="!reachable(i)"
          :aria-current="tab.id === active ? 'step' : undefined"
          :data-step-state="i < index ? 'done' : i === index ? 'current' : 'upcoming'"
          @click="open(tab.id)"
        >
          <span
            class="size-7 shrink-0 rounded-full border flex items-center justify-center text-xs font-medium transition-colors"
            :class="
              i < index
                ? 'bg-primary border-primary text-primary-foreground'
                : i === index
                  ? 'border-primary text-primary'
                  : 'text-muted-foreground'
            "
          >
            <Check v-if="i < index" class="size-3.5" />
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span
            class="truncate"
            :class="i === index ? 'font-medium text-foreground' : 'text-muted-foreground'"
          >
            {{ tab.label }}
          </span>
        </button>
        <span
          v-if="i < tabs.length - 1"
          class="h-px flex-1 min-w-4"
          :class="i < index ? 'bg-primary' : 'bg-border'"
        />
      </li>
    </ol>
    <div class="flex-1 min-h-0 overflow-auto p-(--app-pad-tight)" data-app-fill-area>
      <component
        :is="canvas.grid"
        v-if="canvas && active"
        :key="active"
        :parent-id="componentId"
        :tab="active"
      />
    </div>
    <div class="flex items-center gap-2 px-(--app-pad) py-2.5 border-t shrink-0">
      <Button v-if="index > 0" variant="outline" size="sm" @click="back">
        <ChevronLeft class="size-4" />
        {{ props.props.backLabel || t('apps.steps.back') }}
      </Button>
      <span class="ml-auto text-xs text-muted-foreground">
        {{ t('apps.steps.progress', { step: index + 1, total: tabs.length }) }}
      </span>
      <Button size="sm" :disabled="busy && isLast" @click="next">
        <template v-if="isLast">
          <Loader2 v-if="busy" class="size-4 animate-spin" />
          {{ props.props.finishLabel || t('apps.steps.finish') }}
        </template>
        <template v-else>
          {{ props.props.nextLabel || t('apps.steps.next') }}
          <ChevronRight class="size-4" />
        </template>
      </Button>
    </div>
  </div>
  <div v-else-if="visible && accordion" class="h-full flex flex-col min-h-0" data-testid="accordion">
    <template v-for="(tab, i) in tabs" :key="tab.id">
      <button
        :id="`${componentId}-${tab.id}-header`"
        type="button"
        class="flex items-center gap-2 px-(--app-pad) py-2.5 text-sm text-left shrink-0 transition-colors hover:bg-accent/50 outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
        :class="[i > 0 && 'border-t', tab.id === active ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground']"
        :aria-expanded="tab.id === active"
        :aria-controls="`${componentId}-${tab.id}-section`"
        :data-section="tab.id"
        @click="open(tab.id)"
      >
        <ChevronDown
          class="size-4 shrink-0 transition-transform"
          :class="tab.id !== active && '-rotate-90'"
        />
        <span class="truncate">{{ tab.label }}</span>
      </button>
      <div
        v-if="tab.id === active"
        :id="`${componentId}-${tab.id}-section`"
        role="region"
        :aria-labelledby="`${componentId}-${tab.id}-header`"
        class="flex-1 min-h-0 overflow-auto border-t p-(--app-pad-tight)" data-app-fill-area
      >
        <component :is="canvas.grid" v-if="canvas" :key="active" :parent-id="componentId" :tab="active" />
      </div>
    </template>
  </div>
  <div v-else-if="visible" class="h-full flex flex-col min-h-0">
    <div
      class="flex items-end gap-1 px-(--app-pad-tight) pt-1.5 border-b shrink-0 overflow-x-auto"
      role="tablist"
    >
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="tab.id === active"
        class="px-4 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors"
        :class="
          tab.id === active
            ? 'border-primary text-foreground font-medium'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        "
        @click="open(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="flex-1 min-h-0 overflow-auto p-(--app-pad-tight)" data-app-fill-area>
      <component
        :is="canvas.grid"
        v-if="canvas && active"
        :key="active"
        :parent-id="componentId"
        :tab="active"
      />
    </div>
  </div>
  <!-- Hidden: tells the grid cell to drop its card chrome (see AppGrid). -->
  <div v-else class="app-widget-hidden" />
</template>
