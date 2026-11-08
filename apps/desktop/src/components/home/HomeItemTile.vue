<script setup lang="ts">
import { Workflow, Folders, AppWindow } from 'lucide-vue-next';
import StarButton from '@/components/StarButton.vue';
import { toAssetUrl } from '@/utils/assetUrl';
import type { LiveItemType } from '@/composables/useLiveItems';
import { ENTITY_COLORS } from '@/config/entityColors';

// One workflow, app or project tile on the dashboard (Starred, Recently opened).
// Workflows and apps get a star toggle in the corner when `starrable`.
const props = defineProps<{
  type: LiveItemType;
  identifier: string;
  name: string;
  image?: string | null;
  subtitle?: string;
  starrable?: boolean;
}>();

const emit = defineEmits<{ open: [] }>();

const typeIcons = { task: Workflow, project: Folders, app: AppWindow } as const;

const typeTint = {
  task: ENTITY_COLORS.workflow.tint,
  project: ENTITY_COLORS.project.tint,
  app: ENTITY_COLORS.app.tint,
} as const;
</script>

<template>
  <div class="group relative min-w-0">
    <button
      type="button"
      class="flex flex-col gap-2.5 w-full h-full p-3.5 border border-border rounded-md bg-card hover:bg-muted/50 transition-colors text-left"
      @click="emit('open')"
    >
      <span
        class="flex items-center justify-center w-8 h-8 rounded-md shrink-0 overflow-hidden"
        :class="toAssetUrl(props.image) ? '' : typeTint[props.type]"
      >
        <img v-if="toAssetUrl(props.image)" :src="toAssetUrl(props.image)!" class="w-full h-full object-cover" />
        <component :is="typeIcons[props.type]" v-else class="w-4 h-4" />
      </span>
      <div class="min-w-0">
        <p class="text-sm font-medium leading-snug line-clamp-2">{{ props.name }}</p>
        <p v-if="props.subtitle" class="text-xs text-muted-foreground truncate mt-1">{{ props.subtitle }}</p>
      </div>
    </button>
    <StarButton
      v-if="props.starrable && props.type !== 'project'"
      :type="props.type"
      :identifier="props.identifier"
      :name="props.name"
      :image="props.image"
      subtle
      class="absolute top-2 right-2"
    />
  </div>
</template>
