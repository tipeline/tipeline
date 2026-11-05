<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { CheckCheck, ChevronDown, ChevronUp, Copy, Lock, Search } from 'lucide-vue-next';
import { Input } from '@/components/ui/input';
import { formatValue, exceedsDisplayThreshold } from '@/utils/truncateValue';

export interface RunVariable {
  name: string;
  value: unknown;
  type: string | null;
  scope: 'task' | 'global' | 'env' | 'core';
  hidden: boolean;
}

const props = defineProps<{
  variables: RunVariable[];
  // The run is still going: values are the ones loaded last, not the final ones.
  live?: boolean;
}>();

const { t } = useI18n();

// Same list as core's nonSerializableTypes: these are nulled before they're saved.
const NOT_SAVED_TYPES = new Set(['browser', 'sshConnection', 'dbConnection', 'image']);

const query = ref('');
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return q ? props.variables.filter((v) => v.name.toLowerCase().includes(q)) : props.variables;
});

const expanded = reactive<Record<string, boolean>>({});
const copied = reactive<Record<string, boolean>>({});

function hasValue(variable: RunVariable) {
  return variable.value !== null && variable.value !== undefined && variable.value !== '';
}

function display(variable: RunVariable) {
  return formatValue(variable.value, 2);
}

function shouldShowMore(variable: RunVariable) {
  return exceedsDisplayThreshold(display(variable), 300, 3);
}

async function copy(variable: RunVariable) {
  const v = variable.value;
  await navigator.clipboard.writeText(typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v));
  copied[variable.name] = true;
  setTimeout(() => (copied[variable.name] = false), 1500);
}
</script>

<template>
  <div class="flex flex-col gap-3 min-w-0">
    <div class="flex flex-col gap-0.5">
      <h3 class="text-sm font-semibold">
        {{ t('runVariables.title') }}
        <span class="ml-1 text-xs font-normal text-muted-foreground">{{ variables.length }}</span>
      </h3>
      <p class="text-xs text-muted-foreground">
        {{ live ? t('runVariables.liveNote') : t('runVariables.finalValues') }}
      </p>
    </div>

    <div v-if="variables.length > 6" class="relative">
      <Search class="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
      <Input v-model="query" :placeholder="t('runVariables.search')" class="h-8 pl-7 text-xs" />
    </div>

    <p v-if="variables.length === 0" class="text-xs text-muted-foreground">
      {{ t('runVariables.empty') }}
    </p>
    <p v-else-if="filtered.length === 0" class="text-xs text-muted-foreground">
      {{ t('runVariables.noMatch') }}
    </p>

    <div v-for="variable in filtered" :key="variable.name" class="flex flex-col gap-1 text-xs">
      <div class="flex items-center gap-1.5 min-w-0">
        <span class="font-mono font-medium truncate" :title="variable.name">{{ variable.name }}</span>
        <span v-if="variable.type" class="text-muted-foreground shrink-0">{{ variable.type }}</span>
        <span
          v-if="variable.scope !== 'task'"
          class="shrink-0 rounded border px-1 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
          >{{ t(`runVariables.scope.${variable.scope}`) }}</span
        >
      </div>

      <div
        v-if="variable.hidden"
        class="flex items-center gap-1.5 rounded bg-muted px-2 py-1.5 text-muted-foreground"
      >
        <Lock class="size-3 shrink-0" />
        {{ variable.scope === 'env' ? t('runVariables.hiddenEnv') : t('runVariables.hiddenSecret') }}
      </div>
      <div
        v-else-if="!hasValue(variable)"
        class="rounded bg-muted px-2 py-1.5 italic text-muted-foreground"
      >
        {{
          variable.type && NOT_SAVED_TYPES.has(variable.type)
            ? t('runVariables.notSaved', { type: variable.type })
            : t('runVariables.noValue')
        }}
      </div>
      <div v-else class="relative rounded bg-muted">
        <div class="px-2 py-1.5 pr-7 overflow-x-auto">
          <span
            class="font-mono text-foreground/90 whitespace-pre block"
            :style="expanded[variable.name] ? {} : { maxHeight: '5.5em', overflow: 'hidden' }"
            >{{ display(variable) }}</span
          >
          <button
            v-if="shouldShowMore(variable)"
            class="flex items-center gap-0.5 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 font-medium mt-1 underline-offset-2 hover:underline"
            @click="expanded[variable.name] = !expanded[variable.name]"
          >
            <ChevronUp v-if="expanded[variable.name]" class="size-3" />
            <ChevronDown v-else class="size-3" />
            {{ expanded[variable.name] ? 'Show less' : 'Show more' }}
          </button>
        </div>
        <button
          class="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground transition-colors"
          @click="copy(variable)"
        >
          <CheckCheck v-if="copied[variable.name]" class="size-3 text-emerald-500" />
          <Copy v-else class="size-3" />
        </button>
      </div>
    </div>
  </div>
</template>
