<script setup lang="ts">
import { computed } from 'vue';
import { Loader2, Play } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import JsonWidget from '@/components/app/widgets/JsonWidget.vue';

export interface ScriptPreviewResult {
  ok: boolean;
  hasResult: boolean;
  result?: unknown;
  error?: string;
  logs: string[];
  context: Record<string, unknown>;
  durationMs: number;
}

// The script field's Output tab: what the last Run returned, what it logged,
// and the context values it ran with (flagging the ones built from sample data).
const props = defineProps<{
  output: ScriptPreviewResult | null;
  running: boolean;
  label: string;
  // Context keys whose expressions use a variable that has no real run value.
  sampleKeys: Set<string>;
  disabled?: boolean;
}>();
const emit = defineEmits<{ run: [] }>();

const isStructured = computed(() => {
  const r = props.output?.result;
  return r !== null && typeof r === 'object';
});

function formatValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const contextEntries = computed(() => Object.entries(props.output?.context ?? {}));
</script>

<template>
  <div class="flex min-h-full flex-col gap-3 p-3 text-xs">
    <div class="flex items-center gap-2">
      <span class="truncate text-[11px] text-muted-foreground">{{ label }}</span>
      <span v-if="output && !running" class="font-mono text-[11px] text-muted-foreground">
        · {{ output.durationMs }} ms
      </span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        class="ml-auto h-7 gap-1.5 px-2 text-xs"
        :disabled="running || disabled"
        @click="emit('run')"
      >
        <Loader2 v-if="running" class="size-3.5 animate-spin" />
        <Play v-else class="size-3.5" />
        Run
      </Button>
    </div>

    <p v-if="!output && !running" class="text-muted-foreground">
      Run the script to see what it returns, with its context filled from the data named above. Nothing else in the
      workflow runs.
    </p>

    <template v-if="output">
      <section v-if="output.error" class="rounded-md border border-destructive/40 bg-destructive/10 p-2">
        <p class="mb-1 font-medium text-destructive">Error</p>
        <pre class="m-0 whitespace-pre-wrap break-words font-mono text-destructive">{{ output.error }}</pre>
      </section>

      <section v-else>
        <p class="mb-1 font-medium">Returned</p>
        <p v-if="!output.hasResult" class="text-muted-foreground">Nothing — the script has no <code>return</code>.</p>
        <div v-else-if="isStructured" class="max-h-80 overflow-auto rounded-md border" style="--app-pad: 0.5rem">
          <JsonWidget :props="{ data: output.result, expandDepth: 2 }" />
        </div>
        <pre v-else class="m-0 whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-2 font-mono">{{
          formatValue(output.result)
        }}</pre>
      </section>

      <section v-if="output.logs.length">
        <p class="mb-1 font-medium">Logs</p>
        <pre class="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-2 font-mono">{{
          output.logs.join('\n')
        }}</pre>
      </section>

      <section v-if="contextEntries.length">
        <p class="mb-1 font-medium">Context</p>
        <ul class="m-0 list-none space-y-0.5 p-0 font-mono">
          <li v-for="[key, value] in contextEntries" :key="key" class="flex gap-2">
            <span class="shrink-0 text-muted-foreground">{{ key }}:</span>
            <span class="min-w-0 truncate" :title="formatValue(value)">{{ formatValue(value) }}</span>
            <span
              v-if="sampleKeys.has(key)"
              class="ml-auto shrink-0 rounded bg-amber-500/15 px-1 font-sans text-[10px] text-amber-700 dark:text-amber-400"
              title="Built from a variable with no value from a real run yet — a sample value was used."
            >
              sample
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
