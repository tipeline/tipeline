<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, Copy } from 'lucide-vue-next';
import { formatValue, valueAt, type ValueFormat } from '@/utils/appFormat';
import AppBadge from '../AppBadge.vue';
import AppColorChip from './AppColorChip.vue';
import AppSkeleton from './AppSkeleton.vue';

// One object shown as labeled fields — typically `{= someTable.selectedRow =}`.
// `fields` fix the order, labels and formats (keys may be paths like `customer.name`);
// otherwise every key of the object is shown. Nested objects and lists show as JSON.
interface Field {
  key: string;
  label?: string;
  format?: ValueFormat;
  currency?: string;
  colors?: Record<string, unknown>;
}

const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const { t, locale } = useI18n();

const data = computed<Record<string, unknown> | null>(() => {
  const raw = Array.isArray(props.props.data) ? props.props.data[0] : props.props.data;
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
});

const configured = computed<Field[]>(() =>
  Array.isArray(props.props.fields)
    ? props.props.fields.filter((f: any) => f && typeof f.key === 'string' && f.key)
    : []
);

const isEmpty = (v: unknown) => v === null || v === undefined || v === '';

const entries = computed(() => {
  const fields = configured.value.length
    ? configured.value
    : Object.keys(data.value ?? {}).map((key) => ({ key }) as Field);
  return fields
    .map((field) => {
      const raw = valueAt(data.value, field.key);
      const structured = raw !== null && typeof raw === 'object';
      return {
        key: field.key,
        label: field.label || field.key,
        raw,
        badge: field.format === 'badge',
        color: field.format === 'color' && !structured,
        colors: field.colors,
        structured: structured && field.format !== 'badge',
        text: structured ? JSON.stringify(raw, null, 2) : formatValue(raw, field, locale.value),
      };
    })
    .filter((e) => !(props.props.hideEmpty && isEmpty(e.raw)));
});

// The builder shows the configured labels, or what `data` is bound to.
const bindingText = computed(() => (typeof props.props.data === 'string' ? props.props.data : ''));

const copied = ref<string | null>(null);
async function copy(entry: { key: string; raw: unknown; text: string }) {
  const text = entry.raw !== null && typeof entry.raw === 'object' ? entry.text : String(entry.raw ?? '');
  await navigator.clipboard.writeText(text);
  copied.value = entry.key;
  setTimeout(() => {
    if (copied.value === entry.key) copied.value = null;
  }, 1500);
}

const grid = computed(() => props.props.display === 'grid');
</script>

<template>
  <div class="h-full flex flex-col min-h-0 p-(--app-pad) gap-2">
    <p v-if="props.props.title" class="text-sm font-semibold m-0 truncate shrink-0">
      {{ props.props.title }}
    </p>

    <!-- Builder: labels only (values come from bindings at runtime) -->
    <template v-if="editable">
      <dl v-if="configured.length" class="m-0 grid gap-x-4 gap-y-1.5 text-sm opacity-60" :class="grid ? 'kv-grid' : 'kv-list'">
        <div v-for="field in configured" :key="field.key" :class="grid ? 'flex flex-col gap-0.5' : 'contents'">
          <dt class="text-xs text-muted-foreground truncate">{{ field.label || field.key }}</dt>
          <dd class="m-0 text-muted-foreground">—</dd>
        </div>
      </dl>
      <p v-else class="text-xs font-mono text-muted-foreground m-0 truncate" :title="bindingText">
        {{ bindingText || t('apps.details.noData') }}
      </p>
    </template>

    <AppSkeleton v-else-if="!data && busy" variant="details" class="flex-1" />
    <div
      v-else-if="!data"
      class="flex-1 flex items-center justify-center text-xs text-muted-foreground text-center"
    >
      {{ props.props.emptyText || t('apps.details.noData') }}
    </div>

    <dl v-else class="m-0 grid gap-x-4 gap-y-2 overflow-auto min-h-0 text-sm" :class="grid ? 'kv-grid' : 'kv-list'">
      <!-- list: label and value are cells of the 2-column grid; grid: one cell each -->
      <div
        v-for="entry in entries"
        :key="entry.key"
        class="group/kv"
        :class="grid ? ['flex flex-col gap-0.5 min-w-0', entry.structured && 'col-span-full'] : 'contents'"
      >
        <dt class="text-xs text-muted-foreground pt-0.5 break-words">{{ entry.label }}</dt>
        <dd class="m-0 min-w-0 flex items-start gap-1">
          <pre
            v-if="entry.structured"
            class="m-0 flex-1 min-w-0 text-xs font-mono whitespace-pre-wrap break-words bg-muted/50 rounded px-1.5 py-1"
          >{{ entry.text }}</pre>
          <span v-else-if="isEmpty(entry.raw)" class="flex-1 text-muted-foreground">—</span>
          <span v-else-if="entry.badge" class="flex-1 min-w-0"><AppBadge :value="entry.raw" :colors="entry.colors" /></span>
          <span v-else-if="entry.color" class="flex-1 min-w-0"><AppColorChip :value="entry.raw" /></span>
          <span v-else class="flex-1 min-w-0 whitespace-pre-wrap break-words">{{ entry.text }}</span>
          <button
            v-if="props.props.copyable && !isEmpty(entry.raw)"
            type="button"
            class="shrink-0 p-0.5 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover/kv:opacity-100 focus-visible:opacity-100 transition-opacity"
            :title="t('apps.details.copy')"
            @click="copy(entry)"
          >
            <component :is="copied === entry.key ? Check : Copy" class="size-3.5" />
          </button>
        </dd>
      </div>
    </dl>
  </div>
</template>

<style scoped>
/* list: label column sized to the longest label (within reason), value takes the rest */
.kv-list {
  grid-template-columns: minmax(5rem, max-content) minmax(0, 1fr);
}
/* grid: label above value, as many fields per line as fit */
.kv-grid {
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
}
</style>
