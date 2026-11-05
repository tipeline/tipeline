<script setup>
import { getGroupMeta, getValidation, getAllValidations } from '@tipeline/schemas';
import { useIcon } from '@/composables/useIcon';
import { useI18n } from 'vue-i18n';
import { useActionT } from '@/composables/useActionT';
import { computed, inject } from 'vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Card from '@/components/Card.vue';
import { usePluginStore } from '@/store/pluginStore';
import { summarizeAction } from '@/utils/actionSummary';

const { getIconComponent } = useIcon();
const { t } = useI18n();
const { tAction } = useActionT();
const pluginStore = usePluginStore();
const builtinGroups = new Set(Object.keys(getAllValidations()));

const emit = defineEmits(['edit', 'delete', 'duplicate', 'toggle-disabled', 'open-subtask-builder']);

const props = defineProps({
  item: {
    type: Object,
    required: true,
  },
  isDebug: {
    type: Boolean,
    required: true,
    default: () => false,
  },
  hasOrderingError: {
    type: Boolean,
    default: false,
  },
  hasFieldError: {
    type: Boolean,
    default: false,
  },
  // True when a disabled ancestor container already skips this action at run
  // time, regardless of its own `disabled` flag. Visual only.
  isAncestorDisabled: {
    type: Boolean,
    default: false,
  },
});

const meta = computed(() => {
  if (props.item.source === 'plugin') return { icon: 'Boxes' };
  try {
    return getGroupMeta(props.item.group);
  } catch {
    return { icon: 'Boxes' };
  }
});

const validator = computed(() => {
  if (props.item.source === 'plugin') {
    return {
      label: props.item.label ?? props.item.name,
      description: props.item.description ?? '',
      color: undefined,
    };
  }
  try {
    return getValidation(props.item.group, props.item.name, 'creation');
  } catch {
    return {
      label: props.item.label ?? props.item.name,
      description: props.item.description ?? '',
      color: undefined,
    };
  }
});

// Provided by TaskEdit.vue: identifier -> name of every installed workflow.
const workflowNames = inject('workflowNames', null);

// What this step does (its key setting), shown under the name instead of the
// action type's fixed description.
const summary = computed(() =>
  summarizeAction(props.item, {
    workflowName: (id) => workflowNames?.value?.get(id),
    word: (key, count) =>
      count === undefined ? t(`tasks.builder.canvas.summary.${key}`) : t(`tasks.builder.canvas.summary.${key}`, count),
  })
);
const summaryText = computed(() => summary.value.map((p) => p.text).join(''));

// Only path-based subtasks (no identifier) have nothing to route to.
const subtaskTargetIdentifier = computed(() => {
  if (props.item.group !== 'subtask') return undefined;
  return props.item.params?.identifier || undefined;
});

const isUnavailable = computed(() => {
  const group = props.item.group;
  if (props.item.source === 'plugin') return !pluginStore.enabledPluginGroups.includes(group);
  if (builtinGroups.has(group)) return false;
  return !pluginStore.enabledPluginGroups.includes(group);
});

const accentColorMap = {
  violet: 'border-violet-400',
  amber: 'border-amber-400',
  emerald: 'border-emerald-400',
};

const cardClass = computed(() => {
  const color = validator.value?.color;
  // Always reserve the same 4px on the left, so every row's content starts at
  // the same x — otherwise the base Card's 1px border (non-accented rows) vs.
  // this 4px border (accented rows) shifts the icon/text by a few px and
  // throws off alignment with the row-number gutter. No color override for
  // plain actions: they keep the theme's default border color on all sides
  // (same as accented rows' non-left edges), so their outline stays visible.
  const typeBorder = `border-l-4 ${color ? (accentColorMap[color] ?? '') : ''}`;
  if (props.hasOrderingError || props.hasFieldError) return `${typeBorder} bg-red-50 dark:bg-red-950/30`;
  if (props.item.disabled || props.isAncestorDisabled) return `${typeBorder} opacity-40`;
  if (props.item.error) return `${typeBorder} bg-red-50 dark:bg-red-950/30`;
  if (props.item.finished) return `${typeBorder} bg-emerald-50 dark:bg-emerald-950/30`;
  return typeBorder;
});
</script>

<template>
  <Card
    class="py-2 group transition-colors duration-200 ease-in-out hover:ring-1 hover:ring-primary/50 hover:bg-accent/40"
    class-content="px-2"
    :class="cardClass"
  >
    <template #content>
      <div
        class="item-content flex items-center gap-3 transition-all duration-200 ease-in-out relative"
        :class="{ finished: item.finished }"
      >
        <!-- Left -->
        <span v-if="!isDebug" class="cursor-grab p-2 drag-handle">
          <component
            :is="getIconComponent('GripVerticalIcon')"
            class="size-4"
          />
        </span>
        <span v-if="isDebug" class="p-2">
          <div
            class="shrink-0 h-4 w-4 rounded-full flex items-center justify-center"
            :class="{
              'bg-red-500': item.error,
              'bg-emerald-500': !item.error && item.finished,
              'bg-primary': item.running && !item.error && !item.finished,
              'bg-gray-400': !item.error && !item.finished && !item.running,
            }"
          >
            <component
              v-if="item.error"
              :is="getIconComponent('X')"
              class="size-3 text-white"
            />
            <component
              v-else-if="item.finished"
              :is="getIconComponent('Check')"
              class="size-3 text-white"
            />
            <component
              v-else-if="item.running"
              :is="getIconComponent('Loader2')"
              class="size-3 text-white animate-spin"
            />
          </div>
        </span>

        <!-- Left -->

        <component
          :is="getIconComponent(meta.icon)"
          class="size-5 transition-colors duration-200 ease-in-out group-hover:text-primary"
        />

        <component
          v-if="isUnavailable"
          :is="getIconComponent('TriangleAlert')"
          class="size-4 text-amber-500 shrink-0"
          title="Plugin is disabled — this action will fail when run"
        />
        <component
          v-if="hasOrderingError"
          :is="getIconComponent('TriangleAlert')"
          class="size-4 text-red-500 shrink-0"
          :title="`'${validator.label}' is in an invalid position and will cause a runtime error`"
        />
        <component
          v-if="hasFieldError"
          :is="getIconComponent('CircleAlert')"
          class="size-4 text-red-500 shrink-0"
          title="Required fields are missing — double-click to configure"
        />

        <span class="item-title flex-1 min-w-0 font-medium text-foreground transition-colors duration-200 ease-in-out">
          <div class="text-sm">{{ tAction(item.group, item.name) || validator.label }}</div>
          <div
            v-if="summary.length"
            class="text-xs font-normal text-foreground/75 truncate"
            :title="summaryText"
          >
            <template v-for="(part, i) in summary" :key="i">
              <code v-if="part.kind === 'var'" class="font-mono text-[11px] text-blue-700 dark:text-blue-400">{{ part.text }}</code>
              <span v-else-if="part.kind === 'name'" class="font-medium text-violet-700 dark:text-violet-400">{{ part.text }}</span>
              <span v-else>{{ part.text }}</span>
            </template>
          </div>
          <div v-if="item.comment" class="flex items-start gap-1 text-xs text-foreground/80 mt-0.5">
            <component :is="getIconComponent('MessageSquareText')" class="size-3 mt-0.5 shrink-0 text-foreground/60" />
            <span>{{ item.comment }}</span>
          </div>
        </span>
        <button
          v-if="subtaskTargetIdentifier && !isDebug"
          type="button"
          class="shrink-0 text-violet-600 dark:text-violet-400 hover:opacity-70"
          :title="t('actionMenu.openSubtaskBuilder')"
          @click.stop="emit('open-subtask-builder', item)"
        >
          <component :is="getIconComponent('ListTree')" class="size-5" />
        </button>
        <DropdownMenu v-if="!isDebug">
          <DropdownMenuTrigger>
            <component :is="getIconComponent('EllipsisVertical')" class="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>{{ t('actionMenu.title') }}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="emit('edit', item)" class="cursor-pointer">
              <component :is="getIconComponent('SquarePen')" class="size-5" />
              {{ t('actionMenu.edit') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="emit('duplicate', item)" class="cursor-pointer">
              <component :is="getIconComponent('Copy')" class="size-5" />
              {{ t('actionMenu.duplicate') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="emit('toggle-disabled', item)" class="cursor-pointer">
              <component :is="getIconComponent(item.disabled ? 'Eye' : 'EyeOff')" class="size-5" />
              {{ item.disabled ? t('actionMenu.enable') : t('actionMenu.disable') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="emit('delete', item)" class="cursor-pointer text-red-500 focus:text-red-500">
              <component :is="getIconComponent('Trash')" class="size-5" />
              {{ t('actionMenu.delete') }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </template>
  </Card>
</template>
