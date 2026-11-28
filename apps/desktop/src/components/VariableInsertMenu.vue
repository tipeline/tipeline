<script setup lang="ts">
import { computed, nextTick, ref, watch, type HTMLAttributes } from 'vue';
import { useI18n } from 'vue-i18n';
import { Braces, ChevronLeft, ChevronRight, Search } from 'lucide-vue-next';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { menuEntries, type ExpressionSuggestion } from '@/utils/expressionField';

// The `{}` button and menu that picks a reference to insert — shared by ExpressionInput
// (text fields) and the CodeMirror template editors. One level at a time: objects and
// lists open like folders, and a search box (with more than 8 options) finds nested
// fields at any depth. It only picks: the host inserts the path once the menu has closed
// (`closed`), since the open menu traps focus and the host's field can't take it back.

const props = withDefaults(
  defineProps<{
    suggestions: ExpressionSuggestion[];
    disabled?: boolean;
    /** Classes for the trigger button (position and size). */
    triggerClass?: HTMLAttributes['class'];
    iconSize?: number;
  }>(),
  { disabled: false, triggerClass: undefined, iconSize: 14 }
);

const emit = defineEmits<{
  /** Pressed on the trigger, before focus leaves the host's field (save its selection). */
  'trigger-mousedown': [];
  /** The menu has closed: `path` is the pick, null when closed without one. */
  closed: [path: string | null];
}>();

const open = defineModel<boolean>('open', { default: false });

const { t } = useI18n();

const menuPath = ref<string | null>(null);
const menuSearch = ref('');
const menuListRef = ref<HTMLDivElement | null>(null);
const searchRef = ref<HTMLInputElement | null>(null);
const showSearch = computed(() => props.suggestions.length > 8);
const menuRows = computed(() =>
  menuEntries(props.suggestions, { path: menuPath.value, search: menuSearch.value })
);
// Notes for the rows on show (a list's first item says how to use every item).
const menuNotes = computed(() =>
  menuSearch.value.trim()
    ? []
    : [...new Set(menuRows.value.map((r) => r.suggestion.note).filter((n): n is string => !!n))]
);
const menuPathParent = computed(
  () => props.suggestions.find((s) => s.path === menuPath.value)?.parent ?? null
);

let pendingPath: string | null = null;

/** Shows the fields inside `path` (null: the top level), keeping the menu open. */
function openInMenu(path: string | null) {
  menuPath.value = path;
  menuSearch.value = '';
  // The rows are replaced, so the focused one is gone: focus the new first row.
  nextTick(() =>
    menuListRef.value?.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')?.focus()
  );
}

function onMenuRowSelect(e: Event, path: string, opens: boolean) {
  if (!opens) {
    pendingPath = path;
    return;
  }
  e.preventDefault();
  openInMenu(path);
}

function onOpenSelect(e: Event, path: string) {
  e.preventDefault();
  openInMenu(path);
}

// Typing anywhere in the menu goes to its search box (instead of the menu's
// jump-to-row typeahead); ↓ from the box moves into the rows, ← goes back a level.
function onMenuKeydown(e: KeyboardEvent) {
  const inSearch = e.target === searchRef.value;
  if (e.key === 'ArrowLeft' && menuPath.value !== null && !inSearch) {
    e.preventDefault();
    e.stopPropagation();
    openInMenu(menuPathParent.value);
    return;
  }
  if (!showSearch.value || inSearch) return;
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.stopPropagation();
    searchRef.value?.focus();
  }
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    menuListRef.value?.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')?.focus();
    return;
  }
  // Escape and Tab still close the menu; everything else is just typing.
  if (e.key !== 'Escape' && e.key !== 'Tab') e.stopPropagation();
}

// The menu would hand focus back to its trigger on close — the host decides instead.
function onCloseAutoFocus(e: Event) {
  e.preventDefault();
  const path = pendingPath;
  pendingPath = null;
  emit('closed', path);
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  menuPath.value = null;
  menuSearch.value = '';
  // After the menu's own focus handling has run.
  if (showSearch.value) requestAnimationFrame(() => searchRef.value?.focus());
});
</script>

<template>
  <DropdownMenu v-model:open="open">
    <DropdownMenuTrigger
      type="button"
      :class="
        cn(
          'inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50',
          triggerClass
        )
      "
      :disabled="disabled"
      :title="t('expressionInput.insert')"
      :aria-label="t('expressionInput.insert')"
      @mousedown="emit('trigger-mousedown')"
    >
      <Braces :size="iconSize" />
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      class="flex max-h-80 w-72 flex-col overflow-hidden p-0"
      @close-auto-focus="onCloseAutoFocus"
      @keydown="onMenuKeydown"
    >
      <div v-if="showSearch" class="flex items-center gap-2 border-b px-2">
        <Search :size="12" class="shrink-0 text-muted-foreground" />
        <input
          ref="searchRef"
          v-model="menuSearch"
          type="text"
          spellcheck="false"
          :placeholder="t('expressionInput.search')"
          :aria-label="t('expressionInput.search')"
          class="h-8 w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          @keydown="onSearchKeydown"
        />
      </div>
      <div ref="menuListRef" class="min-h-0 flex-1 overflow-y-auto p-1">
        <DropdownMenuItem
          v-if="menuPath !== null && !menuSearch.trim()"
          class="cursor-pointer gap-2 text-xs text-muted-foreground"
          @select="(e: Event) => onOpenSelect(e, menuPathParent as string)"
        >
          <ChevronLeft :size="12" />
          <span class="flex-1 truncate font-mono">{{ menuPath }}</span>
          <span class="shrink-0">{{ t('expressionInput.back') }}</span>
        </DropdownMenuItem>
        <p v-for="note in menuNotes" :key="note" class="px-2 py-1 text-[11px] leading-4 text-muted-foreground">
          {{ note }}
        </p>
        <template v-if="menuRows.length > 0">
          <div v-for="row in menuRows" :key="row.suggestion.path" class="flex items-center">
            <DropdownMenuItem
              :disabled="row.suggestion.disabled"
              class="min-w-0 flex-1 cursor-pointer gap-3 text-xs"
              @select="(e: Event) => onMenuRowSelect(e, row.suggestion.path, row.opens)"
            >
              <!-- The key always keeps room; a long description truncates (full text on hover). -->
              <span class="min-w-[35%] flex-1 truncate font-mono">{{
                menuPath !== null && !menuSearch.trim()
                  ? row.suggestion.path.slice(menuPath.length).replace(/^\./, '')
                  : row.suggestion.path
              }}</span>
              <span
                v-if="row.suggestion.detail"
                class="min-w-0 truncate text-muted-foreground"
                :title="row.suggestion.detail"
                >{{ row.suggestion.detail }}</span
              >
              <ChevronRight v-if="row.opens" :size="12" />
            </DropdownMenuItem>
            <DropdownMenuItem
              v-if="row.canOpen && !menuSearch.trim()"
              class="h-7 w-7 shrink-0 cursor-pointer justify-center p-0"
              :title="t('expressionInput.open', { name: row.suggestion.path })"
              :aria-label="t('expressionInput.open', { name: row.suggestion.path })"
              @select="(e: Event) => onOpenSelect(e, row.suggestion.path)"
            >
              <ChevronRight :size="12" />
            </DropdownMenuItem>
          </div>
        </template>
        <p v-else class="px-2 py-1.5 text-xs text-muted-foreground">
          {{ menuSearch.trim() ? t('expressionInput.noMatches') : t('expressionInput.empty') }}
        </p>
      </div>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
