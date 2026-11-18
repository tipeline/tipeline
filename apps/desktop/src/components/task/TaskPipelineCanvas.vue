<script>
export default {
  name: 'TaskPipelineCanvas',
};
</script>

<script setup>
import { ref, computed, inject, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDragAndDrop } from '@formkit/drag-and-drop/vue';
import { animations, state as dragState, isDragState } from '@formkit/drag-and-drop';
import TaskDialogActionEdit from '@/components/task/TaskDialogActionEdit.vue';
import TaskPipelineAction from '@/components/task/TaskPipelineAction.vue';
import { generateIdentifier } from '@tipeline/utils';
import { useSaveTask } from '@/composables/useSaveTask';
import { getOrderingErrorIds, getFieldErrorIds } from '@/utils/flowValidation';
import { countWithDescendants } from '@/utils/rowNumbering';
import { usePluginStore } from '@/store/pluginStore';
import { toast } from '@/components/ui/sonner';

const { t } = useI18n();

const props = defineProps({
  modelValue: {
    type: Array,
    required: true,
    default: () => [],
  },
  isDebug: {
    type: Boolean,
    required: true,
    default: () => false,
  },
  variables: {
    type: Array,
    default: () => [],
  },
  globalVariables: {
    type: Array,
    default: () => [],
  },
  taskIdentifier: {
    type: String,
    default: null,
  },
  isNested: {
    type: Boolean,
    default: false,
  },
  startNumber: {
    type: Number,
    default: 1,
  },
  // Recursion depth: 0 at the root canvas, +1 per nested actions/steps list.
  // Used only to pull each row's number badge back out of the nested-children
  // indentation so all numbers land in one flush-left gutter, Power-Automate-style.
  depth: {
    type: Number,
    default: 0,
  },
  // True when some ancestor container (e.g. a disabled for-each/if) already
  // skips this whole subtree at run time. Purely visual — never written back
  // to item.disabled, so each action's own stored flag survives untouched
  // when the ancestor is re-enabled.
  ancestorDisabled: {
    type: Boolean,
    default: false,
  },
});

const { markDirty } = useSaveTask();
const pluginStore = usePluginStore();

const emit = defineEmits(['update:modelValue']);

const isDialogOpen = ref(false);
const isNewAction = ref(false);
const actionParams = ref();
const containerRef = ref(null);
const localItems = ref([...props.modelValue]);

// Single-slot undo buffer for the last delete, offered via a toast action.
// Lives only in this component's memory (lost on navigating away or refresh)
// since the canvas itself isn't persisted until an explicit save. Reusing the
// same { snapshot } shape as a growing stack is what would let this extend
// into full multi-step undo/redo later without reworking the capture point.
const lastDeleted = ref(null);
const UNDO_DELETE_TOAST_ID = 'canvas-delete-undo';

// Set by TaskEdit.vue after navigating back from a subtask's builder, so the
// action modal the user drilled down from reopens automatically. Every nested
// canvas (one per loop/condition body) checks its own flat item list — only
// the one that actually contains the matching identifier claims it.
const pendingOpenActionId = inject('pendingOpenActionId', null);
const pendingNewActionId = inject('pendingNewActionId', null);

// Lets a subtask action row jump straight to its builder without opening the
// edit modal first — see navigateToSubtaskDirect in TaskEdit.vue.
const navigateToSubtaskDirect = inject('navigateToSubtaskDirect', () => {});

// A sub-workflow step may now point at a workflow the name list hasn't seen.
const refreshWorkflowNames = inject('refreshWorkflowNames', () => {});

function tryReopenPendingAction() {
  if (!pendingOpenActionId?.value) return;
  const match = localItems.value.find((item) => item.identifier === pendingOpenActionId.value);
  if (match) {
    actionParams.value = match;
    // A step just added from the actions library opens as new, like a dropped one.
    isNewAction.value = pendingNewActionId?.value === match.identifier;
    if (pendingNewActionId) pendingNewActionId.value = undefined;
    isDialogOpen.value = true;
    pendingOpenActionId.value = undefined;
  }
}

const orderingErrorIds = ref(getOrderingErrorIds(props.modelValue));
const fieldErrorIds = ref(getFieldErrorIds(props.modelValue, pluginStore.pluginParams, pluginStore.pluginRules));

// Use FormKit's Vue composable with dropZoneClass for empty containers
const [parentRef, items] = useDragAndDrop(localItems, {
  group: 'nested',
  dragHandle: '.drag-handle',
  // This is needed only on creation time because everytime the edit mode
  // transitions to debug is created and destroyed by the parent
  disabled: props.isDebug,
  plugins: [animations()],
  dropZoneClass: 'drop-zone-active',
  // Exclude the empty-state placeholder div from FormKit's draggable nodes so it
  // doesn't cause a values/nodes count mismatch, while still sitting inside the
  // <ul> so that elementFromPoint correctly resolves to the <ul> drop zone.
  draggable: (el) => !el.classList.contains('canvas-empty-state'),
  dragImage: buildDragImage,
  handleNodeDrop: function () {
    markDirty();
    // Use nextTick so FormKit has finished updating items.value before we read it.
    nextTick(() => {
      const freshDrop = items.value.find((item) => item.justDropped);
      if (freshDrop) {
        if (!freshDrop.identifier) freshDrop.identifier = generateIdentifier(11);
        delete freshDrop.justDropped;
        delete freshDrop.type;
        actionParams.value = freshDrop;
        isNewAction.value = true;
        isDialogOpen.value = true;
      }
    });
  },
});

// Row numbers are derived from array position (never stored), so reordering
// via drag-and-drop or splice always yields correct numbers with no bookkeeping.
const itemNumbers = computed(() => {
  const numbers = [];
  let current = props.startNumber;
  for (const item of localItems.value) {
    numbers.push(current);
    current += countWithDescendants(item);
  }
  return numbers;
});

// Each nesting level indents via .nested-children's margin-left (47px).
// The number badge is pulled back left by that same amount per depth level, plus
// the gutter's own width, so every badge lands flush at the canvas's left edge
// regardless of how deep its row is nested.
const NESTED_INDENT_STEP = 47;
const NUMBER_GUTTER_WIDTH = 32;
const numberBadgeStyle = computed(() => ({
  left: `calc(-${NUMBER_GUTTER_WIDTH}px - ${props.depth * NESTED_INDENT_STEP}px)`,
}));

const onHandleSave = () => {
  isNewAction.value = false;
  markDirty();
  if (actionParams.value?.group === 'subtask') refreshWorkflowNames();
};

// When the user discards a freshly dropped action via the dialog's Remove button,
// delete it from the list and close the dialog.
function onHandleCancel() {
  if (isNewAction.value && actionParams.value?.identifier) {
    if (deleteActionByIdentifier(actionParams.value.identifier)) markDirty();
  }
  isNewAction.value = false;
  isDialogOpen.value = false;
}

// isDragging guards the watcher against processing during drag preview.
// FormKit moves the real sidebar item (justDropped:true, no identifier) into
// items the moment the cursor enters the canvas — without this guard the watcher
// would open the dialog or assign identifiers on every hover. A ref, because
// the rows also use it to show that preview as a placeholder.
const isDragging = ref(false);

// A step that is in the list without an identifier once the drag is over (e.g.
// one dropped on the gap between rows) gets one here, so getFieldErrorIds can
// flag it. The dialog isn't opened — the user can double-click to configure it.
watch(
  items,
  (newItems) => {
    if (!isDragging.value) {
      for (const item of newItems) {
        if (!item.identifier && item.group && item.name) {
          item.identifier = generateIdentifier(11);
          delete item.justDropped;
          delete item.type;
          markDirty();
        }
      }
    }
    orderingErrorIds.value = getOrderingErrorIds(newItems);
    fieldErrorIds.value = getFieldErrorIds(newItems, pluginStore.pluginParams, pluginStore.pluginRules);
    emit('update:modelValue', newItems);
  },
  { deep: true }
);

// FormKit's default drag image is `setDragImage(li, ...)` — a snapshot of the
// live row, which would include the row-number badge and, for loops/ifs, the
// whole nested-children block. The picture is built from an off-screen copy
// with both removed instead. The live row must not change during dragstart:
// hiding a block's nested-children there collapses the layout under the
// cursor, and Chromium then cancels the drag — so loops and ifs couldn't be
// moved at all. FormKit removes the returned element on the next tick.
function buildDragImage(data) {
  const source = data.targetData.node.el;
  const image = source.cloneNode(true);
  image.querySelectorAll('.row-number, .nested-children').forEach((el) => el.remove());
  Object.assign(image.style, {
    position: 'fixed',
    top: '-10000px',
    left: '-10000px',
    width: `${source.offsetWidth}px`,
    pointerEvents: 'none',
    listStyle: 'none',
  });
  document.body.appendChild(image);
  data.e.dataTransfer.setDragImage(image, data.e.offsetX, data.e.offsetY);
  return image;
}

// The drag listeners are all capture phase: FormKit stops dragend (and drop)
// from bubbling, so a plain document listener never hears them (dragend is
// heard on the dragged element itself — see onDocumentDragStart). Capture runs
// before FormKit's own handlers, so work that needs FormKit to be finished
// waits a macrotask (a microtask like nextTick would still run before them).
//
// The top-level canvas also keeps a copy of the whole tree from dragstart. A
// drag that ends without a drop on the canvas — released outside it, over the
// actions library, or cancelled with Escape — restores that copy: FormKit has
// already moved the step in as a preview, and it would otherwise stay on
// screen without ever being saved.
const rootRef = ref(null);
// Identifier of the canvas step being dragged (null for a library action), so
// its live row can be shown as the placeholder too.
const draggedIdentifier = ref(null);
let dragSnapshot = null;
let droppedOnCanvas = false;

function onDocumentDragStart(e) {
  isDragging.value = true;
  // dragend is fired at the dragged element, which FormKit often takes out of
  // the page mid-drag: a library action leaves the library list once it is
  // moved into the canvas, a step leaves its old list. A removed element's
  // events never reach document, so the listener goes on the element itself
  // (capture, so it still runs before FormKit's handler there).
  e.target?.addEventListener?.('dragend', onDocumentDragEnd, { capture: true, once: true });
  if (!props.isNested) {
    dragSnapshot = JSON.stringify(localItems.value);
    droppedOnCanvas = false;
  }
  // FormKit fills its drag state in its own dragstart handler, after this one.
  setTimeout(() => {
    draggedIdentifier.value = draggedStep()?.identifier ?? null;
  });
}

function onDocumentDrop(e) {
  if (rootRef.value?.contains(e.target)) droppedOnCanvas = true;
}

function onDocumentDragEnd() {
  isDragging.value = false;
  draggedIdentifier.value = null;
  if (props.isNested) return;
  endZoneActive.value = false;
  const snapshot = dragSnapshot;
  const endDrop = pendingEndDrop;
  const dropped = droppedOnCanvas;
  dragSnapshot = null;
  pendingEndDrop = null;
  droppedOnCanvas = false;
  setTimeout(() => {
    if (endDrop) finishEndDrop(endDrop);
    else if (!dropped && snapshot !== null) restoreSnapshot(snapshot);
    else if (dropped) identifyNewSteps();
  });
}

function restoreSnapshot(snapshot) {
  if (JSON.stringify(localItems.value) === snapshot) return;
  applyMutation((list) => {
    list.splice(0, list.length, ...JSON.parse(snapshot));
    return true;
  });
}

// A drop on a row gets its identifier from handleNodeDrop; one let go over a
// list but not on a row (a gap, a nested list's empty space) gets it here.
function identifyNewSteps() {
  let changed = false;
  const visit = (list) => {
    for (const item of list) {
      if (!item.identifier && item.group && item.name) {
        item.identifier = generateIdentifier(11);
        delete item.justDropped;
        delete item.type;
        changed = true;
      }
      for (const key of ['actions', 'steps']) {
        if (Array.isArray(item.params?.[key])) visit(item.params[key]);
      }
    }
  };
  applyMutation((list) => {
    visit(list);
    return changed;
  });
  if (changed) markDirty();
}

// The area below the last step (top-level canvas only). A drop there adds the
// step at the end — a new one from the actions library, or an existing step
// moved down, from this list or out of a loop or if.
const END_DROP_MARK = '__dropAtEnd';
const endZoneActive = ref(false);
let pendingEndDrop = null;

// The step being dragged, when the drag is one of ours: FormKit drags between
// the actions library and the canvas lists all share the 'nested' group.
function draggedStep() {
  if (!isDragState(dragState)) return null;
  if (dragState.initialParent?.data?.config?.group !== 'nested') return null;
  return dragState.draggedNodes?.[0]?.data?.value ?? null;
}

function onEndZoneDragover(e) {
  if (!draggedStep()) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  endZoneActive.value = true;
}

function onEndZoneDragleave(e) {
  if (e.currentTarget.contains(e.relatedTarget)) return;
  endZoneActive.value = false;
}

// FormKit may already have moved the step into a list while the cursor
// crossed it on the way here, so the step is marked now and looked up in the
// whole tree after dragend: found, it is moved; not found (straight from the
// library), the copy is added.
function onEndZoneDrop(e) {
  endZoneActive.value = false;
  const value = draggedStep();
  if (!value) return;
  e.preventDefault();
  value[END_DROP_MARK] = true;
  pendingEndDrop = { isNew: !value.identifier, copy: JSON.parse(JSON.stringify(value)) };
}

function takeMarkedStep(list) {
  for (let i = 0; i < list.length; i++) {
    if (list[i][END_DROP_MARK]) return list.splice(i, 1)[0];
    for (const key of ['actions', 'steps']) {
      const children = list[i].params?.[key];
      if (Array.isArray(children)) {
        const found = takeMarkedStep(children);
        if (found) return found;
      }
    }
  }
  return null;
}

function finishEndDrop({ isNew, copy }) {
  let identifier;
  applyMutation((list) => {
    const step = takeMarkedStep(list) ?? copy;
    delete step[END_DROP_MARK];
    if (isNew) {
      delete step.justDropped;
      delete step.type;
    }
    if (!step.identifier) step.identifier = generateIdentifier(11);
    identifier = step.identifier;
    list.push(step);
    return true;
  });
  markDirty();
  // Like a drop on a row: a new step opens its settings straight away.
  if (isNew) {
    actionParams.value = localItems.value.find((item) => item.identifier === identifier);
    isNewAction.value = true;
    isDialogOpen.value = true;
  }
}

// Watch for prop changes (e.g. navigating away and back reloads the task).
watch(
  () => props.modelValue,
  (newValue) => {
    if (JSON.stringify(newValue) !== JSON.stringify(localItems.value)) {
      localItems.value = [...newValue];
    }
  },
  { deep: true }
);

onMounted(() => {
  parentRef.value = containerRef.value;
  // Capture phase: see onDocumentDragStart.
  document.addEventListener('dragstart', onDocumentDragStart, true);
  if (!props.isNested) document.addEventListener('drop', onDocumentDrop, true);
  tryReopenPendingAction();
});

// Also react to pendingOpenActionId changing while this canvas is already
// mounted — e.g. "Go to Row" (Ctrl/Cmd+G) targeting a row on the current page,
// as opposed to the subtask-drill-down case above, which always remounts.
watch(
  () => pendingOpenActionId?.value,
  () => tryReopenPendingAction()
);

onUnmounted(() => {
  document.removeEventListener('dragstart', onDocumentDragStart, true);
  document.removeEventListener('drop', onDocumentDrop, true);
});

// Minimal escape key handler
function handleKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.target.blur();
  }
}

function onEditAction(item) {
  console.log('Double clicked!', item);
  if (!props.isDebug) {
    actionParams.value = item;
    isDialogOpen.value = true;
  }
}

function findAndMutate(itemsList, targetIdentifier, mutate) {
  for (let i = 0; i < itemsList.length; i++) {
    if (itemsList[i].identifier === targetIdentifier) {
      mutate(itemsList, i);
      return true;
    }
    if (itemsList[i].params?.actions && Array.isArray(itemsList[i].params.actions)) {
      if (findAndMutate(itemsList[i].params.actions, targetIdentifier, mutate)) return true;
    }
    if (itemsList[i].params?.steps && Array.isArray(itemsList[i].params.steps)) {
      if (findAndMutate(itemsList[i].params.steps, targetIdentifier, mutate)) return true;
    }
  }
  return false;
}

function applyMutation(mutate) {
  const updatedItems = JSON.parse(JSON.stringify(localItems.value));
  const ok = mutate(updatedItems);
  if (ok) {
    localItems.value = updatedItems;
    if (items && items.value !== undefined) items.value = updatedItems;
    emit('update:modelValue', updatedItems);
  }
  return ok;
}

function deleteActionByIdentifier(identifier) {
  return applyMutation((list) => findAndMutate(list, identifier, (arr, i) => arr.splice(i, 1)));
}

function onDeleteAction(item) {
  const snapshot = JSON.parse(JSON.stringify(localItems.value));
  const deleted = deleteActionByIdentifier(item.identifier);
  if (deleted) {
    markDirty();
    lastDeleted.value = { snapshot };
    toast(t('tasks.builder.canvas.actionDeleted'), {
      id: UNDO_DELETE_TOAST_ID,
      duration: 5000,
      action: {
        label: t('tasks.builder.canvas.undo'),
        onClick: onUndoDelete,
      },
    });
  } else {
    console.warn('Item not found for deletion:', item.identifier);
  }
}

function onUndoDelete() {
  if (!lastDeleted.value) return;
  const { snapshot } = lastDeleted.value;
  applyMutation((list) => {
    list.length = 0;
    list.push(...snapshot);
    return true;
  });
  markDirty();
  lastDeleted.value = null;
}

function onDuplicateAction(item) {
  const ok = applyMutation((list) =>
    findAndMutate(list, item.identifier, (arr, i) => {
      const clone = JSON.parse(JSON.stringify(arr[i]));
      clone.identifier = generateIdentifier(11);
      arr.splice(i + 1, 0, clone);
    })
  );
  if (ok) markDirty();
}

function onToggleDisabled(item) {
  const ok = applyMutation((list) =>
    findAndMutate(list, item.identifier, (arr, i) => {
      arr[i].disabled = !arr[i].disabled;
    })
  );
  if (ok) markDirty();
}

function onOpenSubtaskBuilder(item) {
  if (item.params?.identifier) navigateToSubtaskDirect(item.params.identifier);
}
</script>

<!-- Update the template section in TaskPipelineCanvas.vue -->
<template>
  <div ref="rootRef" :class="!isNested ? 'pl-8 flex-1 flex flex-col' : ''">
    <!-- Dialog component -->
    <TaskDialogActionEdit
      v-model:open="isDialogOpen"
      v-model:actionParams="actionParams"
      :variables="props.variables"
      :globalVariables="props.globalVariables"
      :taskIdentifier="props.taskIdentifier"
      :isNew="isNewAction"
      @handleSave="onHandleSave"
      @cancel="onHandleCancel"
    />

    <ul
      ref="containerRef"
      class="draggable-container list-none m-0 relative rounded-[var(--radius)] space-y-2"
      :class="localItems.length === 0
        ? (isNested ? 'min-h-[48px]' : 'min-h-[200px]')
        : (isNested ? '' : 'min-h-[62px]')"
      @keydown="handleKeydown"
    >
      <!-- Empty-state sits inside the <ul> so elementFromPoint walks up through
           the <ul> (the registered drop zone). FormKit ignores it via `draggable`. -->
      <div
        v-if="localItems.length === 0"
        class="canvas-empty-state select-none pointer-events-none"
        :class="isNested
          ? 'ml-5 flex items-center justify-center h-[48px] text-xs text-muted-foreground opacity-50 border border-dashed border-muted-foreground/30 dark:border-muted-foreground/70 rounded'
          : 'flex flex-col items-center justify-center h-[200px] text-center text-muted-foreground'"
      >
        <template v-if="!isNested">
          <svg class="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
          </svg>
          <p class="text-sm font-medium">{{ t('tasks.builder.canvas.emptyTitle') }}</p>
          <p class="text-xs mt-1 opacity-70">{{ t('tasks.builder.canvas.emptyDescription') }}</p>
        </template>
        <template v-else>
          {{ t('tasks.builder.canvas.dropHere') }}
        </template>
      </div>

      <li
        v-for="(item, index) in localItems"
        :key="item.identifier"
        :data-id="item.identifier"
        class="draggable-item cursor-pointer"
        :class="{
          'drop-preview': isDragging
            && (!item.identifier || item.identifier === draggedIdentifier),
        }"
      >
        <div class="relative">
          <span
            class="row-number absolute top-1/2 -translate-y-1/2 w-8 text-center text-xs text-muted-foreground tabular-nums select-none"
            :style="numberBadgeStyle"
          >
            {{ itemNumbers[index] }}
          </span>
          <TaskPipelineAction
            class="ml-5"
            :item="item"
            :isDebug="isDebug"
            :hasOrderingError="orderingErrorIds.includes(item.identifier)"
            :hasFieldError="fieldErrorIds.includes(item.identifier)"
            :isAncestorDisabled="ancestorDisabled"
            @dblclick="onEditAction(item)"
            @edit="onEditAction"
            @delete="onDeleteAction"
            @duplicate="onDuplicateAction"
            @toggle-disabled="onToggleDisabled"
            @open-subtask-builder="onOpenSubtaskBuilder"
          />
        </div>

        <div
          class="nested-children pt-2"
          v-if="item.params?.hasOwnProperty('actions')"
        >
          <TaskPipelineCanvas
            v-model="item.params.actions"
            :isDebug="isDebug"
            :variables="props.variables"
            :globalVariables="props.globalVariables"
            :taskIdentifier="props.taskIdentifier"
            :isNested="true"
            :depth="depth + 1"
            :startNumber="itemNumbers[index] + 1"
            :ancestorDisabled="ancestorDisabled || item.disabled"
          />
        </div>

        <div
          class="nested-children pt-2"
          v-else-if="item.params?.hasOwnProperty('steps')"
        >
          <TaskPipelineCanvas
            v-model="item.params.steps"
            :isDebug="isDebug"
            :variables="props.variables"
            :globalVariables="props.globalVariables"
            :taskIdentifier="props.taskIdentifier"
            :isNested="true"
            :depth="depth + 1"
            :startNumber="itemNumbers[index] + 1"
            :ancestorDisabled="ancestorDisabled || item.disabled"
          />
        </div>
      </li>
    </ul>

    <!-- The rest of the canvas below the last step: dropping a step here adds
         it at the end. Deliberately not a FormKit list, which would move the
         step in as soon as the cursor entered, before anything was dropped. -->
    <div
      v-if="!isNested && !isDebug && localItems.length > 0"
      class="canvas-end-zone flex-1 min-h-[48px] pt-2"
      @dragover="onEndZoneDragover"
      @dragleave="onEndZoneDragleave"
      @drop="onEndZoneDrop"
    >
      <div
        v-if="endZoneActive"
        class="ml-5 flex items-center justify-center h-[48px] text-xs text-muted-foreground border border-dashed border-primary/60 bg-primary/5 rounded pointer-events-none select-none"
      >
        {{ t('tasks.builder.canvas.dropAtEnd') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.draggable-item.dragging {
  opacity: 0.5;
}

/* The step being dragged, where it would land: FormKit moves it into the list
   while the cursor is still moving, so it is shown faded and outlined until
   it is dropped, not like a step that is already there. */
.draggable-item.drop-preview > .relative {
  opacity: 0.5;
  outline: 1px dashed var(--primary);
  outline-offset: 2px;
  border-radius: var(--radius);
}

.nested-children {
  position: relative;
  margin-left: 47px;
}

/* A pseudo-element instead of border-left: an actual border interacts with
   margin-left in a way that introduces ~1px of sub-pixel drift per nesting
   level, compounding with depth. Absolute positioning avoids that entirely. */
.nested-children::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
  background-color: var(--border);
}
</style>
