<script setup lang="ts">
// The debugger's variables column: one line per workflow variable with its value now,
// a mark on the ones the last step changed (and what they were), pinned ones on top.
// A variable opens in place: its value as a tree, the step that set it, and every value
// it took during the run. While the run is paused it can be given a new value.
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useLocalStorage } from '@vueuse/core';
import { CheckCheck, ChevronRight, Copy, Lock, Pencil, Pin, PinOff, Search } from 'lucide-vue-next';
import JsonTree from '@/components/run/JsonTree.vue';
import { Input } from '@/components/ui/input';
import { useActionT } from '@/composables/useActionT';
import type { VariableChange } from '@/composables/useDebugTimeline';
import { formatClock } from '@/utils/runSteps';
import { safeStringify } from '@/utils/truncateValue';

interface Variable {
  name: string;
  type?: string | null;
  value: unknown;
}

const props = defineProps<{
  variables: Variable[];
  /** Each variable's value before the run. */
  initial: Record<string, unknown>;
  history: Record<string, VariableChange[]>;
  lastChanged: Set<string>;
  /** The workflow, so each one keeps its own pins. */
  taskId: string;
  /** The run is paused: values can be changed for the rest of it. */
  canEdit?: boolean;
}>();

const emit = defineEmits<{ setVariable: [name: string, value: unknown] }>();

const { t } = useI18n();
const { tAction } = useActionT();

// Same list as core's nonSerializableTypes: these never come through with a value.
const NOT_SAVED_TYPES = new Set(['browser', 'sshConnection', 'dbConnection', 'image']);

const query = ref('');
const onlyChanged = ref(false);
const pinned = useLocalStorage<string[]>(`tipeline:debugger:pinned:${props.taskId}`, []);
const open = reactive(new Set<string>());
const copied = ref<string | null>(null);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return props.variables.filter(
    (v) => (!q || v.name.toLowerCase().includes(q)) && (!onlyChanged.value || props.lastChanged.has(v.name))
  );
});
const pinnedList = computed(() => filtered.value.filter((v) => pinned.value.includes(v.name)));
const rest = computed(() => filtered.value.filter((v) => !pinned.value.includes(v.name)));

const isSecret = (v: Variable) => v.type === 'secret';
const notSaved = (v: Variable) => !!v.type && NOT_SAVED_TYPES.has(v.type) && (v.value === null || v.value === undefined);

/** The value on one line: "[ 12 items ]", `{"id":1047,…}`, `"text"`. */
function short(value: unknown, max = 60): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return `[ ${t('apps.json.items', { count: value.length }, value.length)} ]`;
  const text = typeof value === 'object' ? safeStringify(value) : typeof value === 'string' ? JSON.stringify(value) : String(value);
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/** What it was before the last step changed it. */
function previous(v: Variable): unknown {
  const changes = props.history[v.name] ?? [];
  return changes.length > 1 ? changes[changes.length - 2].value : props.initial[v.name];
}

function setBy(v: Variable): VariableChange | null {
  const changes = props.history[v.name] ?? [];
  return changes.length ? changes[changes.length - 1] : null;
}

const stepName = (change: VariableChange) =>
  change.manual
    ? t('debugVariables.byYou')
    : change.step
      ? change.step.comment || tAction(change.step.group ?? '', change.step.name ?? '')
      : t('debugVariables.unknownStep');

// Change value: the text being edited, per variable, and why it can't be used.
const editing = reactive<Record<string, string>>({});
const editError = reactive<Record<string, string>>({});

function startEdit(v: Variable) {
  const value = v.value;
  editing[v.name] =
    value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
  delete editError[v.name];
}

/** The text as the variable's type: a number, true/false, JSON for lists and objects. */
function parseEdit(v: Variable, text: string): { ok: true; value: unknown } | { ok: false } {
  const type = v.type ?? 'string';
  if (type === 'string' || type === 'secret') return { ok: true, value: text };
  if (type === 'number') {
    const n = Number(text.trim());
    return text.trim() !== '' && Number.isFinite(n) ? { ok: true, value: n } : { ok: false };
  }
  if (type === 'boolean') {
    const word = text.trim().toLowerCase();
    return word === 'true' || word === 'false' ? { ok: true, value: word === 'true' } : { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function cancelEdit(name: string) {
  delete editing[name];
  delete editError[name];
}

function saveEdit(v: Variable) {
  const parsed = parseEdit(v, editing[v.name] ?? '');
  if (!parsed.ok) {
    editError[v.name] = t('debugVariables.badValue', { type: v.type ?? 'string' });
    return;
  }
  emit('setVariable', v.name, parsed.value);
  delete editing[v.name];
}

function toggle(name: string) {
  open.has(name) ? open.delete(name) : open.add(name);
}

function togglePin(name: string) {
  pinned.value = pinned.value.includes(name) ? pinned.value.filter((n) => n !== name) : [...pinned.value, name];
}

async function copy(v: Variable) {
  try {
    await navigator.clipboard.writeText(typeof v.value === 'object' ? JSON.stringify(v.value, null, 2) : String(v.value ?? ''));
    copied.value = v.name;
    setTimeout(() => (copied.value = null), 1500);
  } catch {
    // Clipboard refused: the value is selectable.
  }
}

const isTree = (value: unknown) => typeof value === 'object' && value !== null;
</script>

<template>
  <div class="flex min-h-0 flex-col" data-testid="debug-variables">
    <div class="flex flex-col gap-2 border-b px-3.5 pb-2.5 pt-3">
      <div class="flex items-center gap-2">
        <h3 class="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          {{ t('runVariables.title') }} · {{ variables.length }}
        </h3>
        <div class="relative ml-auto w-36">
          <Search class="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="query" :placeholder="t('debugVariables.filter')" :aria-label="t('runVariables.search')" class="h-7 pl-6 text-xs" />
        </div>
      </div>
      <div class="flex gap-1 text-xs" role="tablist">
        <button
          type="button"
          role="tab"
          class="rounded px-2 py-0.5 font-medium"
          :class="!onlyChanged ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'"
          :aria-selected="!onlyChanged"
          @click="onlyChanged = false"
        >
          {{ t('debugVariables.all') }}
        </button>
        <button
          type="button"
          role="tab"
          class="rounded px-2 py-0.5 font-medium"
          :class="onlyChanged ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'"
          :aria-selected="onlyChanged"
          data-testid="debug-variables-changed"
          @click="onlyChanged = true"
        >
          {{ t('debugVariables.changed', { count: lastChanged.size }) }}
        </button>
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto scroll-fade pb-2">
      <p v-if="variables.length === 0" class="px-3.5 py-3 text-xs text-muted-foreground">{{ t('debugFooter.noVariables') }}</p>
      <p v-else-if="filtered.length === 0" class="px-3.5 py-3 text-xs text-muted-foreground">{{ t('runVariables.noMatch') }}</p>

      <template v-for="group in [
        { key: 'pinned', list: pinnedList },
        { key: 'rest', list: rest },
      ]" :key="group.key">
        <p
          v-if="group.key === 'pinned' && group.list.length"
          class="px-3.5 pb-0.5 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {{ t('debugVariables.pinned') }}
        </p>
        <p
          v-else-if="group.key === 'rest' && pinnedList.length && group.list.length"
          class="px-3.5 pb-0.5 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {{ t('debugVariables.others') }}
        </p>

        <div
          v-for="v in group.list"
          :key="v.name"
          class="mx-1.5 rounded-md text-xs"
          :class="open.has(v.name) ? 'my-1 border border-blue-500/30 bg-blue-500/5' : ''"
          :data-variable="v.name"
        >
          <button
            type="button"
            class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-muted/60"
            :aria-expanded="open.has(v.name)"
            @click="toggle(v.name)"
          >
            <ChevronRight class="size-3 shrink-0 text-muted-foreground transition-transform" :class="open.has(v.name) ? 'rotate-90' : ''" />
            <span
              class="size-1.5 shrink-0 rounded-full"
              :class="lastChanged.has(v.name) ? 'bg-amber-500' : ''"
              :title="lastChanged.has(v.name) ? t('debugVariables.changedTitle') : undefined"
            />
            <span class="shrink-0 font-mono font-medium">{{ v.name }}</span>
            <span v-if="isSecret(v)" class="flex min-w-0 items-center gap-1 text-muted-foreground"><Lock class="size-3" />{{ t('runVariables.hiddenSecret') }}</span>
            <span v-else-if="notSaved(v)" class="min-w-0 truncate italic text-muted-foreground">{{ t('runVariables.notSaved', { type: v.type }) }}</span>
            <span v-else class="min-w-0 truncate font-mono text-foreground/75">{{ short(v.value) }}</span>
            <span
              v-if="lastChanged.has(v.name) && !isSecret(v)"
              class="ml-auto shrink-0 pl-1 text-[10.5px] text-amber-700 dark:text-amber-400"
              data-testid="debug-variable-was"
            >
              {{ t('debugVariables.was', { value: short(previous(v), 16) }) }}
            </span>
          </button>

          <div v-if="open.has(v.name)" class="flex flex-col gap-2 px-2.5 pb-2.5 pt-0.5">
            <p class="text-[11px] text-muted-foreground">
              <span v-if="v.type">{{ v.type }}</span>
              <template v-if="setBy(v)"> · {{ t('debugVariables.setBy', { step: stepName(setBy(v)!) }) }}</template>
            </p>
            <template v-if="!isSecret(v) && !notSaved(v)">
              <div class="relative rounded border bg-background">
                <div class="max-h-60 overflow-auto px-1.5 py-1 pr-7">
                  <JsonTree v-if="isTree(v.value)" :value="v.value" />
                  <span v-else class="block whitespace-pre-wrap break-words px-1 font-mono">{{ v.value === null || v.value === undefined || v.value === '' ? '—' : String(v.value) }}</span>
                </div>
                <button
                  type="button"
                  class="absolute right-1.5 top-1.5 text-muted-foreground hover:text-foreground"
                  :title="t('runDetail.copy')"
                  :aria-label="t('runDetail.copy')"
                  data-testid="debug-variable-copy"
                  @click="copy(v)"
                >
                  <CheckCheck v-if="copied === v.name" class="size-3.5 text-emerald-500" />
                  <Copy v-else class="size-3.5" />
                </button>
              </div>
              <div v-if="history[v.name]?.length" class="flex flex-col gap-0.5" data-testid="debug-variable-history">
                <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{{ t('debugVariables.history') }}</p>
                <p class="flex gap-2 text-[11px]">
                  <span class="w-14 shrink-0 font-mono text-muted-foreground" />
                  <span class="shrink-0">{{ t('debugVariables.start') }}</span>
                  <span class="min-w-0 truncate font-mono text-muted-foreground">{{ short(initial[v.name], 40) }}</span>
                </p>
                <p v-for="(change, i) in history[v.name]" :key="i" class="flex gap-2 text-[11px]">
                  <span class="w-14 shrink-0 font-mono text-muted-foreground">{{ formatClock(change.timestamp) }}</span>
                  <span class="shrink-0 truncate">{{ stepName(change) }}</span>
                  <span class="min-w-0 truncate font-mono text-muted-foreground">{{ short(change.value, 40) }}</span>
                </p>
              </div>
            </template>
            <div v-if="editing[v.name] !== undefined" class="flex flex-col gap-1.5" data-testid="debug-variable-edit">
              <textarea
                v-model="editing[v.name]"
                rows="3"
                class="w-full resize-y rounded border bg-background px-2 py-1 font-mono text-[11.5px] outline-none focus:ring-1 focus:ring-ring"
                :aria-label="t('debugVariables.newValue', { name: v.name })"
                @keydown.esc.stop="cancelEdit(v.name)"
              />
              <p v-if="editError[v.name]" class="text-[11px] text-destructive">{{ editError[v.name] }}</p>
              <div class="flex gap-1.5">
                <button
                  type="button"
                  class="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                  data-testid="debug-variable-save"
                  @click="saveEdit(v)"
                >
                  {{ t('debugVariables.useValue') }}
                </button>
                <button
                  type="button"
                  class="rounded border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-muted"
                  @click="cancelEdit(v.name)"
                >
                  {{ t('common.cancel') }}
                </button>
              </div>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-if="canEdit && editing[v.name] === undefined && !notSaved(v)"
                type="button"
                class="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-muted"
                data-testid="debug-variable-change"
                @click="startEdit(v)"
              >
                <Pencil class="size-3" />
                {{ t('debugVariables.changeValue') }}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-[11px] font-medium hover:bg-muted"
                @click="togglePin(v.name)"
              >
                <component :is="pinned.includes(v.name) ? PinOff : Pin" class="size-3" />
                {{ pinned.includes(v.name) ? t('debugVariables.unpin') : t('debugVariables.pin') }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
