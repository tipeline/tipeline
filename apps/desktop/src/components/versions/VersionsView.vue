<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { format, formatDistanceToNow } from 'date-fns';
import { TZDate } from '@date-fns/tz';
import { dump } from 'js-yaml';
import { yaml as yamlLang } from '@codemirror/lang-yaml';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { useColorMode } from '@vueuse/core';
import { History, Loader2, RotateCcw, TriangleAlert } from 'lucide-vue-next';
import Card from '@/components/Card.vue';
import VersionDiff from '@/components/task/VersionDiff.vue';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/sonner';
import { useTimezone } from '@/composables/useTimezone';
import { useErrorT } from '@/composables/useErrorT';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { cn } from '@/lib/utils';

type Origin = 'edit' | 'created' | 'hub' | 'reload' | 'backup' | 'restore' | 'earlier';

// What changed from the version before (Core's RevisionSummary / AppRevisionSummary).
interface Summary {
  added: string[]; // steps, or components
  removed: string[];
  addedCount: number;
  removedCount: number;
  changed: number;
  details: boolean;
  variables?: boolean; // workflows
  pagesAdded?: string[]; // apps
  pagesRemoved?: string[];
  workflows?: boolean;
}

interface Revision {
  id: number;
  origin: Origin;
  summary: Summary | null;
  restoredFrom: number | null;
  createdAt: string;
  current: boolean;
}

// A workflow's or an app's versions: `item` is its detail (identifier, source_type,
// auto_update).
const props = defineProps<{ kind: 'task' | 'app'; item: any }>();
// It changed (a version was put back): the page reloads it.
const emit = defineEmits<{ updated: [] }>();

const { t, te } = useI18n();

const CHANNELS = {
  task: { list: SEND.TASK_REVISION_LIST, detail: SEND.TASK_REVISION_DETAIL, restore: SEND.TASK_REVISION_RESTORE },
  app: { list: SEND.APP_REVISION_LIST, detail: SEND.APP_REVISION_DETAIL, restore: SEND.APP_REVISION_RESTORE },
};
const channels = computed(() => CHANNELS[props.kind]);

/** Texts under tasks.versions; an app's own wording under apps.versions where it differs. */
function vt(key: string, ...args: any[]): string {
  const own = `apps.versions.${key}`;
  return (t as any)(props.kind === 'app' && te(own) ? own : `tasks.versions.${key}`, ...args);
}
const { appTimezone } = useTimezone();
const { translateError } = useErrorT();
const colorMode = useColorMode();

const revisions = ref<Revision[]>([]);
const isLoading = ref(true);
const selectedId = ref<number | null>(null);
const preview = ref<string>('');
// The YAML the preview is compared with ('changes' and 'current' views).
const compareWith = ref<string | null>(null);
const isLoadingPreview = ref(false);
// Changes from the version before it, what restoring it would change now, or its YAML.
type View = 'changes' | 'current' | 'yaml';
const view = ref<View>('changes');
// Versions' YAML by id. Cleared on reload: the newest edit version can still change
// (saves close together are merged into it).
let yamlById = new Map<number, string>();
// An app version's workflows that are no longer installed, by id (from its detail).
const missingById = new Map<number, string[]>();
const missingWorkflows = ref<string[]>([]);
const confirmOpen = ref(false);
const isRestoring = ref(false);

const selected = computed(() => revisions.value.find((r) => r.id === selectedId.value) ?? null);
const byId = computed(() => new Map(revisions.value.map((r) => [r.id, r])));
const previous = computed(() => {
  const index = revisions.value.findIndex((r) => r.id === selectedId.value);
  return index >= 0 ? (revisions.value[index + 1] ?? null) : null;
});
const views = computed<View[]>(() => {
  const list: View[] = [];
  if (previous.value) list.push('changes');
  if (selected.value && !selected.value.current) list.push('current');
  list.push('yaml');
  return list;
});

async function load(select?: number) {
  isLoading.value = true;
  yamlById = new Map();
  try {
    revisions.value = (await invokeCore<Revision[]>(channels.value.list, { identifier: props.item.identifier })) ?? [];
    const keep = select ?? selectedId.value;
    selectedId.value = revisions.value.some((r) => r.id === keep) ? keep : (revisions.value[0]?.id ?? null);
  } catch (e: any) {
    toast.error(vt('loadFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isLoading.value = false;
  }
}

load();

async function yamlOf(id: number): Promise<string> {
  const cached = yamlById.get(id);
  if (cached !== undefined) return cached;
  const detail = await invokeCore<{ source: string; missingWorkflows?: string[] }>(channels.value.detail, {
    identifier: props.item.identifier,
    revisionId: id,
  });
  missingById.set(id, detail.missingWorkflows ?? []);
  let text: string;
  try {
    text = dump(JSON.parse(detail.source), { lineWidth: -1 });
  } catch {
    text = detail.source;
  }
  yamlById.set(id, text);
  return text;
}

let loadToken = 0;
watch([selectedId, view, views], async ([id]) => {
  if (!views.value.includes(view.value)) {
    view.value = views.value[0];
    return; // runs again with the view that fits
  }
  const token = ++loadToken;
  preview.value = '';
  compareWith.value = null;
  missingWorkflows.value = [];
  if (id == null) return;
  isLoadingPreview.value = true;
  try {
    const other =
      view.value === 'changes' ? previous.value?.id : view.value === 'current' ? revisions.value[0]?.id : undefined;
    const [text, compare] = await Promise.all([yamlOf(id), other != null ? yamlOf(other) : null]);
    if (token !== loadToken) return;
    preview.value = text;
    compareWith.value = compare;
    missingWorkflows.value = missingById.get(id) ?? [];
  } catch (e: any) {
    if (token === loadToken) toast.error(vt('loadFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    if (token === loadToken) isLoadingPreview.value = false;
  }
});

async function restore() {
  if (!selected.value) return;
  isRestoring.value = true;
  try {
    await invokeCore(channels.value.restore, {
      identifier: props.item.identifier,
      revisionId: selected.value.id,
    });
    confirmOpen.value = false;
    toast.success(vt('restored', { when: formatDate(selected.value.createdAt) }));
    await load();
    // The restore is the newest version now.
    selectedId.value = revisions.value[0]?.id ?? null;
    emit('updated');
  } catch (e: any) {
    toast.error(vt('restoreFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isRestoring.value = false;
  }
}

function formatDate(date: string) {
  try {
    return format(new TZDate(new Date(date), appTimezone.value), 'MMM d, yyyy HH:mm');
  } catch {
    return date;
  }
}

function relative(date: string) {
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  } catch {
    return '';
  }
}

function originLabel(revision: Revision) {
  if (revision.origin === 'restore') {
    const from = revision.restoredFrom != null ? byId.value.get(revision.restoredFrom) : null;
    return from
      ? vt('origin.restoreFrom', { when: formatDate(from.createdAt) })
      : vt('origin.restore');
  }
  return vt(`origin.${revision.origin}`);
}

function names(list: string[], count: number) {
  const more = count - list.length;
  return more > 0 ? `${list.join(', ')} ${vt('more', more)}` : list.join(', ');
}

function summaryLines(revision: Revision): string[] {
  const s = revision.summary;
  if (!s) return [];
  const lines: string[] = [];
  if (s.pagesAdded?.length) lines.push(vt('pagesAdded', { pages: s.pagesAdded.join(', ') }));
  if (s.pagesRemoved?.length) lines.push(vt('pagesRemoved', { pages: s.pagesRemoved.join(', ') }));
  if (s.addedCount) lines.push(vt('added', { steps: names(s.added, s.addedCount) }));
  if (s.removedCount) lines.push(vt('removed', { steps: names(s.removed, s.removedCount) }));
  if (s.changed) lines.push(vt('changed', s.changed));
  if (s.variables) lines.push(vt('variables'));
  if (s.workflows) lines.push(vt('workflows'));
  if (s.details) lines.push(vt('details'));
  return lines.length ? lines : [vt('noStepChanges')];
}

const willAutoUpdate = computed(() => props.item?.source_type === 'hub' && !!props.item?.auto_update);

const extensions = computed(() => {
  const base = [yamlLang(), EditorView.lineWrapping, EditorState.readOnly.of(true), EditorView.editable.of(false)];
  return colorMode.value === 'dark' ? [...base, oneDark] : base;
});
</script>

<template>
  <AlertDialog v-model:open="confirmOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ vt('confirmTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ vt('confirmDescription', { when: selected ? formatDate(selected.createdAt) : '' }) }}
          <span v-if="willAutoUpdate" class="block mt-2">{{ vt('confirmHub') }}</span>
          <span v-if="missingWorkflows.length" class="block mt-2 text-amber-700 dark:text-amber-400">
            {{ vt('missingWorkflows', { names: missingWorkflows.join(', ') }) }}
          </span>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction :disabled="isRestoring" @click.prevent="restore">
          {{ isRestoring ? vt('restoring') : vt('restore') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <div class="flex flex-col lg:flex-row gap-4 h-full min-h-0 pb-4">
    <Card class="lg:w-96 shrink-0 min-h-0" class-content="p-0 flex flex-col min-h-0">
      <template #title>{{ vt('title') }}</template>
      <template #description>{{ vt('description') }}</template>
      <template #content>
        <div v-if="isLoading" class="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 class="size-4 animate-spin" />
        </div>
        <div v-else-if="!revisions.length" class="flex flex-col items-center gap-2 py-10 px-6 text-center text-sm text-muted-foreground">
          <History class="size-5" />
          {{ vt('empty') }}
        </div>
        <ul v-else class="scroll-fade overflow-y-auto min-h-0 flex-1 border-t">
          <li v-for="revision in revisions" :key="revision.id">
            <button
              type="button"
              :class="
                cn(
                  'w-full text-left px-4 py-3 border-b cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50',
                  revision.id === selectedId && 'bg-muted'
                )
              "
              @click="selectedId = revision.id"
            >
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium truncate" :title="formatDate(revision.createdAt)">
                  {{ relative(revision.createdAt) }}
                </span>
                <Badge v-if="revision.current" variant="secondary" class="text-[10px] px-1.5 py-0">
                  {{ vt('current') }}
                </Badge>
                <span class="ml-auto text-xs text-muted-foreground shrink-0">{{ originLabel(revision) }}</span>
              </div>
              <p
                v-for="(line, index) in summaryLines(revision)"
                :key="index"
                class="text-xs text-muted-foreground truncate mt-0.5"
                :title="line"
              >
                {{ line }}
              </p>
            </button>
          </li>
        </ul>
      </template>
    </Card>

    <Card class="flex-1 min-h-[24rem] min-w-0" class-content="p-0 flex flex-col min-h-0">
      <template #title>
        {{ selected ? formatDate(selected.createdAt) : vt('previewTitle') }}
      </template>
      <template v-if="selected" #description>{{ originLabel(selected) }}</template>
      <template v-if="selected && !selected.current" #actions>
        <Button variant="outline" size="sm" :disabled="isLoadingPreview" @click="confirmOpen = true">
          <RotateCcw class="size-4" />
          {{ vt('restore') }}
        </Button>
      </template>
      <template #content>
        <div v-if="selected" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3">
          <Tabs v-model="view">
            <TabsList>
              <TabsTrigger v-for="option in views" :key="option" :value="option">
                {{ vt(`view.${option}`) }}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <span class="text-xs text-muted-foreground">{{ vt(`viewHint.${view}`) }}</span>
        </div>
        <p v-if="missingWorkflows.length" class="flex items-start gap-1.5 px-4 pb-3 m-0 text-xs text-amber-700 dark:text-amber-400">
          <TriangleAlert class="size-3.5 shrink-0 mt-px" />
          {{ vt('missingWorkflows', { names: missingWorkflows.join(', ') }) }}
        </p>
        <div v-if="isLoadingPreview" class="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 class="size-4 animate-spin" />
        </div>
        <div v-else-if="preview && view !== 'yaml' && compareWith !== null" class="flex-1 min-h-0 overflow-hidden border-t">
          <!-- Before: the version before it, or the workflow now; after: this version. -->
          <VersionDiff :before="compareWith" :after="preview" />
        </div>
        <div v-else-if="preview" class="flex-1 min-h-0 overflow-hidden border-t">
          <codemirror :model-value="preview" style="height: 100%; width: 100%" :extensions="extensions" />
        </div>
      </template>
    </Card>
  </div>
</template>
