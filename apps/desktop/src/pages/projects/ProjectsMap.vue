<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Loader2, RefreshCw } from 'lucide-vue-next';
import { clusterLeaves, clusterSize, layoutGroups, mergeMap, parsePlan, type LiveMap, type MapNode, type ProjectMapPlan } from '@tipeline/utils';
import Page from '@/components/Page.vue';
import { Button } from '@/components/ui/button';
import MapCanvas from '@/components/projectMap/MapCanvas.vue';
import MapDetailsPanel from '@/components/projectMap/MapDetailsPanel.vue';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';

/**
 * Every project on one map, each in its own box. What more than one project uses (or
 * none) sits in a box of its own, so shared helpers and globals stand out. Read-only:
 * planning happens on a project's own map.
 */

const { t } = useI18n();
const router = useRouter();

const live = ref<LiveMap>({ nodes: [], edges: [] });
const plans = ref<Record<string, ProjectMapPlan>>({});
const loading = ref(true);
const loadError = ref<string | null>(null);
const selected = ref<string | null>(null);

async function load() {
  loadError.value = null;
  try {
    const result = await invokeCore<{ live: LiveMap; plans: Record<string, unknown> }>(SEND.PROJECT_MAP, {
      identifier: null,
    });
    live.value = result.live;
    plans.value = Object.fromEntries(Object.entries(result.plans ?? {}).map(([k, v]) => [k, parsePlan(v)]));
  } catch (error: any) {
    loadError.value = error?.message ?? String(error);
  } finally {
    loading.value = false;
  }
}
const onFocus = () => void load();
onMounted(() => {
  void load();
  window.addEventListener('focus', onFocus);
});
onBeforeUnmount(() => window.removeEventListener('focus', onFocus));

// Statuses noted on each project's plan still show: one plan with every project's notes.
const merged = computed(() => {
  const meta: ProjectMapPlan['meta'] = {};
  const nodes: ProjectMapPlan['nodes'] = [];
  for (const plan of Object.values(plans.value)) {
    Object.assign(meta, plan.meta);
    nodes.push(...plan.nodes.filter((n) => n.link));
  }
  return mergeMap(live.value, { version: 2, nodes, edges: [], positions: {}, meta, lanes: [], ignored: [], notes: [] });
});

/** A node's box: its project, unless it's a global/schedule or used from several projects. */
const groupOf = computed(() => {
  const byKey = new Map(merged.value.nodes.map((n) => [n.key, n]));
  const projectsTouching = new Map<string, Set<string>>();
  for (const e of merged.value.edges) {
    for (const [a, b] of [
      [e.from, e.to],
      [e.to, e.from],
    ]) {
      const other = byKey.get(b)?.project?.identifier;
      if (!other) continue;
      projectsTouching.set(a, (projectsTouching.get(a) ?? new Set()).add(other));
    }
  }
  const out = new Map<string, string | null>();
  for (const n of merged.value.nodes) {
    if (n.project) out.set(n.key, n.project.identifier);
    else {
      // A global or schedule used by one project only goes in that project's box.
      const touching = projectsTouching.get(n.key);
      out.set(n.key, touching && touching.size === 1 ? [...touching][0] : null);
    }
  }
  return out;
});

const groups = computed(() => {
  const seen = new Map<string, { id: string; name: string; color: string | null }>();
  for (const n of merged.value.nodes) {
    if (n.project && !seen.has(n.project.identifier)) {
      seen.set(n.project.identifier, { id: n.project.identifier, name: n.project.name, color: n.project.color });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
});

// Workflows that only feed one node go in a box beside it (an app's own workflows).
const toggled = ref<Set<string>>(new Set());
function toggleCluster(key: string) {
  const next = new Set(toggled.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  toggled.value = next;
}
const clustered = computed(() => clusterLeaves(merged.value.nodes, merged.value.edges, { toggled: toggled.value }));
const byKey = computed(() => new Map(merged.value.nodes.map((n) => [n.key, n])));

const layout = computed(() =>
  layoutGroups(
    [
      ...clustered.value.nodes.map((n) => ({ key: n.key, group: groupOf.value.get(n.key) ?? null })),
      ...clustered.value.clusters.map((c) => ({ key: c.key, group: groupOf.value.get(c.anchor) ?? null, ...clusterSize(c) })),
    ],
    clustered.value.edges,
    groups.value,
    t('projectMap.all.shared')
  )
);

const selectedNode = computed<MapNode | null>(() => merged.value.nodes.find((n) => n.key === selected.value) ?? null);
</script>

<template>
  <Page>
    <template #title>{{ t('projectMap.all.title') }}</template>
    <template #menu>
      <Button size="sm" variant="ghost" :aria-label="t('projectMap.refresh')" @click="load"><RefreshCw class="size-3.5" /></Button>
    </template>
    <template #content>
      <p class="mb-3 text-sm text-muted-foreground">{{ t('projectMap.all.description') }}</p>
      <div v-if="loading" class="flex flex-1 items-center justify-center text-muted-foreground">
        <Loader2 class="size-5 animate-spin" />
      </div>
      <div v-else-if="loadError" class="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{{ loadError }}</div>
      <div v-else-if="!merged.nodes.length" class="rounded-xl border p-6 text-sm text-muted-foreground">
        {{ t('projectMap.all.empty') }}
      </div>
      <div v-else class="flex min-h-0 flex-1 flex-wrap gap-3 pb-2">
        <div class="min-h-[420px] min-w-0 flex-[999_1_560px] overflow-hidden rounded-xl border">
          <MapCanvas
            :nodes="clustered.nodes"
            :edges="clustered.edges"
            :clusters="clustered.clusters"
            :by-key="byKey"
            :layout="layout"
            :selected="selected"
            :editable="false"
            :draggable="false"
            @select="selected = $event"
            @toggle-cluster="toggleCluster"
          />
        </div>
        <div class="min-h-[320px] min-w-0 flex-[1_1_300px] lg:max-w-[360px]">
          <MapDetailsPanel
            v-if="selectedNode"
            class="rounded-xl border bg-card"
            :key="selectedNode.key"
            :node="selectedNode"
            :map="merged"
            :editable="false"
            :lanes="[]"
            @select="selected = $event"
            @close="selected = null"
            @changed="load"
          />
          <aside v-else class="flex h-full flex-col gap-3 rounded-xl border bg-card p-4 text-sm">
            <h3 class="text-base font-semibold">{{ t('projectMap.all.projects') }}</h3>
            <button
              v-for="g in groups"
              :key="g.id"
              type="button"
              class="flex items-center gap-2 text-left text-primary hover:underline"
              @click="router.push({ name: 'ProjectMapEditor', params: { pid: g.id } })"
            >
              <span v-if="g.color" class="size-2.5 rounded-full" :style="{ backgroundColor: g.color }" />
              {{ g.name }}
            </button>
            <p class="mt-auto border-t pt-3 text-xs text-muted-foreground">{{ t('projectMap.all.hint') }}</p>
          </aside>
        </div>
      </div>
    </template>
  </Page>
</template>
