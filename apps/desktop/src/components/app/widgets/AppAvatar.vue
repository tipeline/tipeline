<script setup lang="ts">
import { computed, inject, ref, toRef, watch } from 'vue';
import { User } from 'lucide-vue-next';
import { cn } from '@/lib/utils';
import { useAppImage } from '@/composables/useAppImage';
import { avatarColor, initials, statusColor } from '@/utils/appAvatar';
import { APP_RUNTIME } from '../appRuntimeKey';

// One avatar: the picture (any image src, as an Image's — files too), or the initials on
// the person's color when there is none or it can't load; a status dot in the corner.
const props = withDefaults(
  defineProps<{
    name?: unknown;
    src?: unknown;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    shape?: 'circle' | 'square';
    status?: unknown;
    color?: unknown;
    version?: number;
    editable?: boolean;
    /** A ring in the page's background color (stacked avatars). */
    ring?: boolean;
  }>(),
  { size: 'md', shape: 'circle', version: 0 }
);
const runtime = inject(APP_RUNTIME, null);
const hasSrc = computed(() => props.src !== null && props.src !== undefined && String(props.src).trim() !== '');
const { source, url, fileError } = useAppImage(() => (hasSrc.value ? props.src : ''), {
  version: toRef(props, 'version'),
  editable: () => props.editable,
  appIdentifier: () => runtime?.appIdentifier(),
});
// A picture that fails to load (a broken link) falls back to the initials.
const broken = ref(false);
watch(url, () => (broken.value = false));
const showImage = computed(() => hasSrc.value && source.value.kind !== 'none' && source.value.kind !== 'invalid' && !fileError.value && !!url.value && !broken.value);

const letters = computed(() => initials(props.name));
const color = computed(() => avatarColor(props.name, props.color));
const dot = computed(() => statusColor(props.status));

const SIZES = { xs: 'size-6 text-[10px]', sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg', xl: 'size-20 text-2xl' };
const DOTS = { xs: 'size-2', sm: 'size-2.5', md: 'size-3', lg: 'size-3.5', xl: 'size-4' };
const TINTS = {
  gray: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100',
  blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/70 dark:text-blue-100',
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/70 dark:text-emerald-100',
  amber: 'bg-amber-100 text-amber-900 dark:bg-amber-900/70 dark:text-amber-100',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/70 dark:text-red-100',
  purple: 'bg-violet-100 text-violet-800 dark:bg-violet-900/70 dark:text-violet-100',
};
const DOT_COLORS = { gray: 'bg-slate-400', blue: 'bg-blue-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', purple: 'bg-violet-500' };
</script>

<template>
  <span :class="cn('relative inline-flex shrink-0', SIZES[size])" data-testid="avatar">
    <span
      :class="
        cn(
          'size-full inline-flex items-center justify-center overflow-hidden font-semibold select-none',
          shape === 'square' ? 'rounded-[22%]' : 'rounded-full',
          showImage ? 'bg-muted' : TINTS[color],
          ring && 'ring-2 ring-background'
        )
      "
    >
      <img v-if="showImage" :src="url!" :alt="String(name ?? '')" class="size-full object-cover" draggable="false" @error="broken = true" />
      <template v-else-if="letters">{{ letters }}</template>
      <User v-else class="size-1/2" />
    </span>
    <span
      v-if="dot"
      :class="cn('absolute bottom-0 right-0 rounded-full ring-2 ring-background', DOTS[size], DOT_COLORS[dot])"
      :title="String(status)"
      data-testid="avatar-status"
    />
  </span>
</template>
