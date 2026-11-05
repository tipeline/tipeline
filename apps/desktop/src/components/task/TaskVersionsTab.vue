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
import { History, Loader2, RotateCcw } from 'lucide-vue-next';
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

interface Summary {
  added: string[];
  removed: string[];
  addedCount: number;
  removedCount: number;
  changed: number;
  variables: boolean;
  details: boolean;
}

interface Revision {
  id: number;
  origin: Origin;
  summary: Summary | null;
  restoredFrom: number | null;
  createdAt: string;
  current: boolean;
}

const props = defineProps<{ task: any }>();
// The workflow changed (a version was put back): the page reloads it.
const emit = defineEmits<{ updated: [] }>();

const { t } = useI18n();
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
    revisions.value = (await invokeCore<Revision[]>(SEND.TASK_REVISION_LIST, { identifier: props.task.identifier })) ?? [];
    const keep = select ?? selectedId.value;
    selectedId.value = revisions.value.some((r) => r.id === keep) ? keep : (revisions.value[0]?.id ?? null);
  } catch (e: any) {
    toast.error(t('tasks.versions.loadFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    isLoading.value = false;
  }
}

load();

async function yamlOf(id: number): Promise<string> {
  const cached = yamlById.get(id);
  if (cached !== undefined) return cached;
  const detail = await invokeCore<{ source: string }>(SEND.TASK_REVISION_DETAIL, {
    identifier: props.task.identifier,
    revisionId: id,
  });
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
  if (id == null) return;
  isLoadingPreview.value = true;
  try {
    const other =
      view.value === 'changes' ? previous.value?.id : view.value === 'current' ? revisions.value[0]?.id : undefined;
    const [text, compare] = await Promise.all([yamlOf(id), other != null ? yamlOf(other) : null]);
    if (token !== loadToken) return;
    preview.value = text;
    compareWith.value = compare;
  } catch (e: any) {
    if (token === loadToken) toast.error(t('tasks.versions.loadFailed'), { description: translateError(e?.message ?? String(e)) });
  } finally {
    if (token === loadToken) isLoadingPreview.value = false;
  }
});

async function restore() {
  if (!selected.value) return;
  isRestoring.value = true;
  try {
    await invokeCore(SEND.TASK_REVISION_RESTORE, {
      identifier: props.task.identifier,
      revisionId: selected.value.id,
    });
    confirmOpen.value = false;
    toast.success(t('tasks.versions.restored', { when: formatDate(selected.value.createdAt) }));
    await load();
    // The restore is the newest version now.
    selectedId.value = revisions.value[0]?.id ?? null;
    emit('updated');
  } catch (e: any) {
    toast.error(t('tasks.versions.restoreFailed'), { description: translateError(e?.message ?? String(e)) });
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
      ? t('tasks.versions.origin.restoreFrom', { when: formatDate(from.createdAt) })
      : t('tasks.versions.origin.restore');
  }
  return t(`tasks.versions.origin.${revision.origin}`);
}

function names(list: string[], count: number) {
  const more = count - list.length;
  return more > 0 ? `${list.join(', ')} ${t('tasks.versions.more', more)}` : list.join(', ');
}

function summaryLines(revision: Revision): string[] {
  const s = revision.summary;
  if (!s) return [];
  const lines: string[] = [];
  if (s.addedCount) lines.push(t('tasks.versions.added', { steps: names(s.added, s.addedCount) }));
  if (s.removedCount) lines.push(t('tasks.versions.removed', { steps: names(s.removed, s.removedCount) }));
  if (s.changed) lines.push(t('tasks.versions.changed', s.changed));
  if (s.variables) lines.push(t('tasks.versions.variables'));
  if (s.details) lines.push(t('tasks.versions.details'));
  return lines.length ? lines : [t('tasks.versions.noStepChanges')];
}

const willAutoUpdate = computed(() => props.task?.source_type === 'hub' && !!props.task?.auto_update);

const extensions = computed(() => {
  const base = [yamlLang(), EditorView.lineWrapping, EditorState.readOnly.of(true), EditorView.editable.of(false)];
  return colorMode.value === 'dark' ? [...base, oneDark] : base;
});
</script>

<template>
  <AlertDialog v-model:open="confirmOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('tasks.versions.confirmTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('tasks.versions.confirmDescription', { when: selected ? formatDate(selected.createdAt) : '' }) }}
          <span v-if="willAutoUpdate" class="block mt-2">{{ t('tasks.versions.confirmHub') }}</span>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction :disabled="isRestoring" @click.prevent="restore">
          {{ isRestoring ? t('tasks.versions.restoring') : t('tasks.versions.restore') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <div class="flex flex-col lg:flex-row gap-4 h-full min-h-0 pb-4">
    <Card class="lg:w-96 shrink-0 min-h-0" class-content="p-0 flex flex-col min-h-0">
      <template #title>{{ t('tasks.versions.title') }}</template>
      <template #description>{{ t('tasks.versions.description') }}</template>
      <template #content>
        <div v-if="isLoading" class="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 class="size-4 animate-spin" />
        </div>
        <div v-else-if="!revisions.length" class="flex flex-col items-center gap-2 py-10 px-6 text-center text-sm text-muted-foreground">
          <History class="size-5" />
          {{ t('tasks.versions.empty') }}
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
                  {{ t('tasks.versions.current') }}
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
        {{ selected ? formatDate(selected.createdAt) : t('tasks.versions.previewTitle') }}
      </template>
      <template v-if="selected" #description>{{ originLabel(selected) }}</template>
      <template v-if="selected && !selected.current" #actions>
        <Button variant="outline" size="sm" :disabled="isLoadingPreview" @click="confirmOpen = true">
          <RotateCcw class="size-4" />
          {{ t('tasks.versions.restore') }}
        </Button>
      </template>
      <template #content>
        <div v-if="selected" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-3">
          <Tabs v-model="view">
            <TabsList>
              <TabsTrigger v-for="option in views" :key="option" :value="option">
                {{ t(`tasks.versions.view.${option}`) }}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <span class="text-xs text-muted-foreground">{{ t(`tasks.versions.viewHint.${view}`) }}</span>
        </div>
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
