<script setup>
import { ref, watch, nextTick, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDragAndDrop } from '@formkit/drag-and-drop/vue';
import { GripVertical, Plus } from 'lucide-vue-next';
import {
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useIcon } from '@/composables/useIcon';
const { getIconComponent } = useIcon();
const { t } = useI18n();

// Accept the children array as a prop
const props = defineProps({
  children: {
    type: Array,
    required: true,
  },
  // Search results: a flat list with each action's group and description, the
  // query highlighted, and one row marked as the one Enter adds.
  results: {
    type: Boolean,
    default: false,
  },
  query: {
    type: String,
    default: '',
  },
  // Group key -> label. Kept out of the items themselves: whatever is on an item
  // ends up in the step once it's dropped on the canvas.
  groupLabels: {
    type: Object,
    default: () => ({}),
  },
  activeIndex: {
    type: Number,
    default: -1,
  },
});

const emit = defineEmits(['add', 'hover']);

// Create a local, mutable ref for the children to allow dragging
const subItems = ref(JSON.parse(JSON.stringify(props.children)));

const containerRef = ref(null);

// Initialize drag and drop specifically for this list of sub-items
const [parentRef, items] = useDragAndDrop(subItems, {
  group: 'nested',
  sortable: false,
  // When a drag operation ends, reset the list to its original state.
  // This makes it feel like you are "copying" an item out, rather than moving it.
  dragend: () => {
    subItems.value = JSON.parse(JSON.stringify(props.children));
  },
});

onMounted(() => {
  parentRef.value = containerRef.value;
});

// Minimal escape key handler
function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.target.blur();
  }
}

// Splits text into plain and matching runs, so the match can be highlighted
// without v-html.
function highlightParts(text) {
  const value = text ?? '';
  const q = props.query.trim().toLowerCase();
  if (!q) return [{ text: value, match: false }];
  const parts = [];
  const lower = value.toLowerCase();
  let from = 0;
  let at = lower.indexOf(q);
  while (at !== -1) {
    if (at > from) parts.push({ text: value.slice(from, at), match: false });
    parts.push({ text: value.slice(at, at + q.length), match: true });
    from = at + q.length;
    at = lower.indexOf(q, from);
  }
  if (from < value.length) parts.push({ text: value.slice(from), match: false });
  return parts;
}

// Safety net alongside `dragend` above: this list is meant to always mirror
// `props.children` (it's a copy source, not a real destination). `dragend`
// only fires on the submenu where the drag *started*, so if the cursor
// passes back over a *different* group's submenu (or this one, before
// `dragend` fires) formkit's cross-container transfer can splice an item
// into it — growing it, not just shrinking it. Comparing against
// props.children (instead of only checking for a shrink) catches that case
// too, so an aborted drag can't leave a stray duplicate behind.
watch(
  items,
  () => {
    if (JSON.stringify(items.value) !== JSON.stringify(props.children)) {
      nextTick(() => {
        items.value = JSON.parse(JSON.stringify(props.children));
      });
    }
  },
  { deep: true }
);

// Keep the row Enter would add in view while arrowing through results.
watch(
  () => props.activeIndex,
  (index) => {
    if (index < 0) return;
    nextTick(() => {
      containerRef.value?.$el
        ?.querySelector(`[data-result-index="${index}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  }
);
</script>

<template>
  <SidebarMenuSub
    ref="containerRef"
    :class="results ? 'mx-0 border-l-0 px-0' : ''"
    @keydown="handleKeydown"
  >
    <SidebarMenuSubItem v-for="(child, index) in items" :key="child.id || `${child.group}.${child.name}`">
      <Tooltip :delay-duration="400" :disabled="results">
        <TooltipTrigger as-child>
          <!-- Classes go on the button, not the <a>, so they merge with its h-7 / items-center. -->
          <SidebarMenuSubButton
            as-child
            :class="[
              results ? 'h-auto flex-col items-stretch gap-0 py-1.5' : '',
              results && index === activeIndex ? 'bg-sidebar-accent' : '',
            ]"
          >
            <a
              class="group/action cursor-grab active:cursor-grabbing"
              :data-result-index="results ? index : undefined"
              @dblclick="emit('add', child)"
              @mouseenter="results && emit('hover', index)"
            >
              <span class="flex w-full min-w-0 items-center gap-2">
                <component v-if="child.icon" :is="getIconComponent(child.icon)" class="size-4" />
                <span class="min-w-0 flex-1 truncate">
                  <template v-for="(part, partIndex) in highlightParts(child.label)" :key="partIndex">
                    <mark v-if="part.match" class="bg-transparent font-semibold text-foreground">{{ part.text }}</mark>
                    <template v-else>{{ part.text }}</template>
                  </template>
                </span>
                <span
                  v-if="results"
                  class="shrink-0 text-xs text-muted-foreground group-hover/action:hidden"
                >
                  {{ groupLabels[child.group] ?? child.group }}
                </span>
                <GripVertical
                  class="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover/action:opacity-100"
                  aria-hidden="true"
                />
                <button
                  type="button"
                  class="hidden size-5 shrink-0 place-items-center rounded border bg-background text-foreground hover:bg-accent group-hover/action:grid focus-visible:grid"
                  :aria-label="t('actionsLibrary.addToEnd', { name: child.label })"
                  :title="t('actionsLibrary.addToEnd', { name: child.label })"
                  @click.stop.prevent="emit('add', child)"
                  @mousedown.stop
                  @pointerdown.stop
                >
                  <Plus class="size-3" />
                </button>
              </span>
              <span
                v-if="results && child.description"
                class="truncate text-xs text-muted-foreground"
              >
                <template v-for="(part, partIndex) in highlightParts(child.description)" :key="partIndex">
                  <mark v-if="part.match" class="bg-transparent font-medium text-foreground">{{ part.text }}</mark>
                  <template v-else>{{ part.text }}</template>
                </template>
              </span>
            </a>
          </SidebarMenuSubButton>
        </TooltipTrigger>
        <TooltipContent v-if="child.description" side="right" align="start" class="max-w-xs">
          {{ child.description }}
        </TooltipContent>
      </Tooltip>
    </SidebarMenuSubItem>
  </SidebarMenuSub>
</template>
