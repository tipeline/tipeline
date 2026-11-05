<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Star } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { useStarredItemsStore, type StarredItemType } from '@/store/starredItems';

// Stars a workflow or app for the dashboard. `icon` fits the list action rows and the
// dashboard tiles (`subtle` hides it until hover unless starred); `button` fits page headers.
const props = withDefaults(
  defineProps<{
    type: StarredItemType;
    identifier: string;
    name: string;
    image?: string | null;
    variant?: 'icon' | 'button';
    subtle?: boolean;
  }>(),
  { variant: 'icon', image: null }
);

const { t } = useI18n();
const starred = useStarredItemsStore();

const isStarred = computed(() => starred.isStarred(props.type, props.identifier));
const hint = computed(() => (isStarred.value ? t('starred.unstar') : t('starred.star')));

function toggle() {
  starred.toggle(props.type, props.identifier, props.name, props.image);
}
</script>

<template>
  <Button v-if="variant === 'button'" variant="outline" :aria-pressed="isStarred" :title="hint" @click="toggle">
    <Star class="w-4 h-4" :class="isStarred ? 'fill-amber-400 text-amber-500' : ''" />
    {{ isStarred ? t('starred.starred') : t('starred.starLabel') }}
  </Button>
  <button
    v-else
    type="button"
    class="p-1 hover:bg-accent rounded transition-colors focus-visible:opacity-100"
    :class="subtle && !isStarred ? 'opacity-0 group-hover:opacity-100' : ''"
    :title="hint"
    :aria-label="hint"
    :aria-pressed="isStarred"
    @click.stop="toggle"
  >
    <Star class="size-4" :class="isStarred ? 'fill-amber-400 text-amber-500' : ''" />
  </button>
</template>
