<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { pageInfo, pageWindow } from '@/utils/appPagination';

// Page numbers for anything paged by a workflow — cards, a list view, a gallery (a
// table pages itself). `total` is how many rows there are (usually a binding to the
// workflow's count); the state holds `page`, `pageSize`, `offset`, `from` and `to`, so a
// runnable's inputs can ask for just that page, and `change` fires on every move (also
// when the page size changes, which goes back to page 1).
const props = defineProps<{
  props: Record<string, any>;
  state?: Record<string, any>;
  componentId?: string;
  editable?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{
  event: [name: string, payload?: Record<string, unknown>];
  state: [patch: Record<string, unknown>];
}>();
const { t, locale } = useI18n();

const sizes = computed<number[]>(() =>
  Array.isArray(props.props.pageSizes) ? props.props.pageSizes.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : []
);
// In the builder the total is usually still a binding: show some pages.
const total = computed(() => (props.editable && typeof props.props.total === 'string' && /\{[{=%]/.test(props.props.total) ? 57 : props.props.total));
const info = computed(() =>
  pageInfo(props.editable ? 1 : props.state?.page ?? 1, props.state?.pageSize ?? props.props.pageSize, total.value)
);
const numbers = computed(() => pageWindow(info.value.page, info.value.pages, props.props.compact ? 0 : 1));
const fmt = (n: number) => n.toLocaleString(locale.value);

// The total shrank (a filter): the page it was on may not exist any more.
watch(
  () => info.value.pages,
  (pages) => {
    // (Shown pages are already kept in range; the state the app reads must follow.)
    if (!props.editable && Number(props.state?.page ?? 1) > pages) report(pages, info.value.pageSize);
  }
);

function report(page: number, pageSize: number) {
  const next = pageInfo(page, pageSize, total.value);
  const patch = { page: next.page, pageSize: next.pageSize, offset: next.offset, from: next.from, to: next.to };
  emit('state', patch);
  emit('event', 'change', patch);
}
function go(page: number) {
  if (props.editable || page === info.value.page || page < 1 || page > info.value.pages) return;
  report(page, info.value.pageSize);
}
function resize(size: unknown) {
  if (props.editable || Number(size) === info.value.pageSize) return;
  report(1, Number(size));
}
const button = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm tabular-nums transition-colors disabled:opacity-40 disabled:pointer-events-none';
</script>

<template>
  <nav
    class="h-full flex flex-wrap items-center gap-x-3 gap-y-1.5 px-(--app-pad) py-1.5"
    :aria-label="t('apps.pagination.label')"
    data-testid="pagination"
  >
    <span v-if="!props.props.hideSummary" class="text-xs text-muted-foreground tabular-nums whitespace-nowrap" data-testid="pagination-summary">
      {{ info.total ? t('apps.pagination.summary', { from: fmt(info.from), to: fmt(info.to), total: fmt(info.total) }) : t('apps.pagination.none') }}
    </span>
    <div v-if="sizes.length" class="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span :id="`${componentId}-per-page`">{{ t('apps.pagination.perPage') }}</span>
      <Select :model-value="String(info.pageSize)" :disabled="editable" @update:model-value="resize">
        <SelectTrigger class="h-7 w-auto gap-1 px-2 text-xs" :aria-labelledby="`${componentId}-per-page`" data-testid="page-size">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="n in sizes" :key="n" :value="String(n)">{{ n }}</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div class="flex items-center gap-1 ml-auto">
      <button type="button" :class="cn(button, 'bg-background hover:bg-accent')" :disabled="editable || info.page <= 1" :aria-label="t('apps.pagination.previous')" data-testid="page-prev" @click="go(info.page - 1)">
        <ChevronLeft class="size-4" />
      </button>
      <template v-for="(n, i) in numbers" :key="`${n}-${i}`">
        <span v-if="n === '…'" class="px-1 text-sm text-muted-foreground" aria-hidden="true">…</span>
        <button
          v-else
          type="button"
          :class="cn(button, n === info.page ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent')"
          :aria-current="n === info.page ? 'page' : undefined"
          :aria-label="t('apps.pagination.page', { n })"
          :disabled="editable"
          data-page
          @click="go(n)"
        >
          {{ n }}
        </button>
      </template>
      <button type="button" :class="cn(button, 'bg-background hover:bg-accent')" :disabled="editable || info.page >= info.pages" :aria-label="t('apps.pagination.next')" data-testid="page-next" @click="go(info.page + 1)">
        <ChevronRight class="size-4" />
      </button>
    </div>
  </nav>
</template>
