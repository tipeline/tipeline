<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppComponentUse, AppUseWay } from '@tipeline/utils';

/**
 * What in an app uses one workflow, under that line in the details: the components by
 * page, each with how it uses it (shows its results, runs it on submit…).
 */
const props = defineProps<{ uses: AppComponentUse[] }>();

const { t, te } = useI18n();

const pages = computed(() => {
  const out = new Map<string, { page: string; items: AppComponentUse[] }>();
  for (const u of props.uses) {
    const group = out.get(u.pageId) ?? { page: u.page, items: [] };
    group.items.push(u);
    out.set(u.pageId, group);
  }
  return [...out.values()];
});

function wayText(way: AppUseWay): string {
  if (way.kind === 'shows') return t('projectMap.uses.shows');
  if (way.kind === 'pageLoad') return t('projectMap.uses.pageLoad');
  if (way.kind === 'other') return t('projectMap.uses.other');
  if (way.label)
    return way.event.startsWith('bulk:')
      ? t('projectMap.uses.bulk', { label: way.label })
      : way.label;
  const key = `projectMap.uses.events.${way.event}`;
  return te(key) ? t(key) : t('projectMap.uses.onEvent', { event: way.event });
}

const typeLabel = (type?: string) =>
  type && te(`builder.components.${type}`)
    ? t(`builder.components.${type}`)
    : (type ?? '');
</script>

<template>
  <div class="flex flex-col gap-1.5 border-l-2 border-muted pl-2.5 text-xs">
    <div v-for="group in pages" :key="group.page" class="flex flex-col gap-0.5">
      <div class="font-medium text-muted-foreground">
        {{ t('projectMap.uses.page', { name: group.page }) }}
      </div>
      <div
        v-for="(u, i) in group.items"
        :key="u.componentId ?? `page-${i}`"
        class="leading-snug"
      >
        <template v-if="u.component">
          <span class="font-medium">{{ u.component }}</span>
          <span class="text-muted-foreground"> · {{ typeLabel(u.type) }}</span>
          <div class="text-muted-foreground">
            {{ u.ways.map(wayText).join(' · ') }}
          </div>
        </template>
        <span v-else class="text-muted-foreground">{{
          u.ways.map(wayText).join(' · ')
        }}</span>
      </div>
    </div>
  </div>
</template>
