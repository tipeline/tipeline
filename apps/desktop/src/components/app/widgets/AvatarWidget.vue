<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { cn } from '@/lib/utils';
import { avatarPeople, type AvatarPerson } from '@/utils/appAvatar';
import AppAvatar from './AppAvatar.vue';
import AppSkeleton from './AppSkeleton.vue';

// A person's avatar — `name` (initials and color), `src` (a picture), `status` (a dot),
// with the name and `subtitle` beside it when `showName` — or, with `data`, a group: a
// stack of overlapping avatars up to `max` and "+N" (`display: stack`, the default), or
// one row per person with their name (`display: list`). A click fires `click` (one) or
// `itemClick` with `<id>.selectedItem` / `selectedIndex` (a group). Pictures from files
// are read again when a run the avatar depends on ends.
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
  state: [patch: Record<string, unknown>];
}>();
const { t } = useI18n();

const SAMPLE = [
  { name: 'Ada Lovelace', status: 'online', role: 'Engineering' },
  { name: 'Grace Hopper', status: 'away', role: 'Research' },
  { name: 'Alan Turing', role: 'Security' },
  { name: 'Katherine Johnson', role: 'Flight' },
];
const sample = computed(() => props.editable && typeof props.props.data === 'string');
const group = computed(() => props.props.data !== undefined && props.props.data !== null && props.props.data !== '');
const people = computed(() =>
  avatarPeople(sample.value ? SAMPLE : props.props.data, {
    nameKey: props.props.nameKey,
    srcKey: props.props.srcKey,
    subtitleKey: sample.value ? 'role' : props.props.subtitleKey,
    statusKey: props.props.statusKey,
  })
);
const list = computed(() => props.props.display === 'list');
const max = computed(() => {
  const n = Number(props.props.max);
  return Number.isInteger(n) && n > 0 ? n : 5;
});
const shown = computed(() => (list.value ? people.value : people.value.slice(0, max.value)));
const more = computed(() => (list.value ? 0 : people.value.length - shown.value.length));
const size = computed(() => (['sm', 'md', 'lg', 'xl'].includes(props.props.size) ? props.props.size : 'md'));
const shape = computed(() => (props.props.shape === 'square' ? 'square' : 'circle'));

const version = ref(0);
watch(
  () => props.busy,
  (now, before) => {
    if (before && !now) version.value++;
  }
);

function clickOne() {
  if (!props.editable) emit('event', 'click');
}
function pick(p: AvatarPerson) {
  if (props.editable) return;
  emit('state', { selectedItem: p.row, selectedIndex: p.index });
  emit('event', 'itemClick', { selectedItem: p.row, selectedIndex: p.index });
}
const OVERLAP = { sm: '-ml-2', md: '-ml-2.5', lg: '-ml-3.5', xl: '-ml-5' } as Record<string, string>;
const MORE = { sm: 'size-8 text-[11px]', md: 'size-10 text-xs', lg: 'size-14 text-sm', xl: 'size-20 text-base' } as Record<string, string>;
const NAME = { sm: 'text-sm', md: 'text-sm', lg: 'text-base', xl: 'text-lg' } as Record<string, string>;
</script>

<template>
  <div class="h-full min-h-0 flex flex-col">
    <div v-if="props.props.title" class="px-(--app-pad) pt-2.5 pb-1 text-sm font-medium truncate shrink-0">{{ props.props.title }}</div>

    <!-- one person -->
    <div v-if="!group" class="flex-1 min-h-0 flex items-center px-(--app-pad-tight) py-1">
      <button
        type="button"
        :class="cn('flex items-center gap-3 min-w-0 max-w-full rounded-md p-1 text-left', !editable && 'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50')"
        :disabled="editable"
        :aria-label="props.props.name || t('apps.avatar.person')"
        data-testid="avatar-one"
        @click="clickOne"
      >
        <AppAvatar
          :name="props.props.name"
          :src="props.props.src"
          :size="size"
          :shape="shape"
          :status="props.props.status"
          :color="props.props.color"
          :version="version"
          :editable="editable"
        />
        <span v-if="props.props.showName" class="min-w-0 flex flex-col">
          <span :class="cn('font-medium truncate', NAME[size])">{{ props.props.name }}</span>
          <span v-if="props.props.subtitle" class="text-xs text-muted-foreground truncate">{{ props.props.subtitle }}</span>
        </span>
      </button>
    </div>

    <AppSkeleton v-else-if="!people.length && busy && !editable" variant="list" class="flex-1" />
    <p v-else-if="!people.length" class="m-auto p-3 text-xs text-muted-foreground">{{ props.props.emptyText || t('apps.avatar.empty') }}</p>

    <!-- a group, one row each -->
    <ul v-else-if="list" class="flex-1 min-h-0 overflow-y-auto m-0 p-(--app-pad-tight) list-none flex flex-col gap-0.5" data-testid="avatar-list">
      <li v-for="p in shown" :key="p.index">
        <button
          type="button"
          :class="cn('w-full flex items-center gap-3 rounded-md p-1.5 text-left', !editable && 'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50')"
          :disabled="editable"
          data-item
          @click="pick(p)"
        >
          <AppAvatar :name="p.name" :src="p.src" :size="size" :shape="shape" :status="p.status" :version="version" :editable="editable" />
          <span class="min-w-0 flex flex-col">
            <span :class="cn('font-medium truncate', NAME[size])">{{ p.name }}</span>
            <span v-if="p.subtitle" class="text-xs text-muted-foreground truncate">{{ p.subtitle }}</span>
          </span>
        </button>
      </li>
    </ul>

    <!-- a group, stacked -->
    <div v-else class="flex-1 min-h-0 flex items-center px-(--app-pad) py-1">
      <div class="flex items-center" role="group" :aria-label="props.props.title || t('apps.avatar.group', { count: people.length }, people.length)" data-testid="avatar-stack">
        <button
          v-for="(p, i) in shown"
          :key="p.index"
          type="button"
          :class="cn('relative rounded-full hover:z-10 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', i > 0 && OVERLAP[size], shape === 'square' && 'rounded-[22%]')"
          :title="p.subtitle ? `${p.name} · ${p.subtitle}` : p.name"
          :aria-label="p.name"
          :disabled="editable"
          data-item
          @click="pick(p)"
        >
          <AppAvatar :name="p.name" :src="p.src" :size="size" :shape="shape" :status="p.status" :version="version" :editable="editable" ring />
        </button>
        <span
          v-if="more > 0"
          :class="cn('relative inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-medium ring-2 ring-background tabular-nums', OVERLAP[size], MORE[size], shape === 'square' && 'rounded-[22%]')"
          :title="people.slice(max).map((p) => p.name).join(', ')"
          data-testid="avatar-more"
          >+{{ more }}</span
        >
      </div>
    </div>
  </div>
</template>
