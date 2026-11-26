<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// 'mod' is ⌘ on macOS and Ctrl elsewhere (useKeyboardShortcuts accepts either).
type Key = 'mod' | 'shift' | string;
type Shortcut = { id: string; keys: Key[] };
type Group = { id: string; items: Shortcut[] };

// Kept by hand: when a page gains or changes a shortcut, update it here too.
const GROUPS: Group[] = [
  {
    id: 'general',
    items: [
      { id: 'search', keys: ['mod', 'J'] },
      { id: 'assistant', keys: ['mod', 'K'] },
      { id: 'back', keys: ['mod', '['] },
      { id: 'forward', keys: ['mod', ']'] },
      { id: 'sidebar', keys: ['mod', 'B'] },
    ],
  },
  {
    id: 'workflowOverview',
    items: [
      { id: 'openBuilder', keys: ['mod', 'B'] },
      { id: 'editDetails', keys: ['mod', 'I'] },
      { id: 'export', keys: ['mod', 'E'] },
    ],
  },
  {
    id: 'workflowBuilder',
    items: [
      { id: 'save', keys: ['mod', 'S'] },
      { id: 'undo', keys: ['mod', 'Z'] },
      { id: 'redo', keys: ['mod', 'shift', 'Z'] },
      { id: 'testRun', keys: ['mod', 'Enter'] },
      { id: 'searchActions', keys: ['mod', 'F'] },
      { id: 'goToRow', keys: ['mod', 'G'] },
      { id: 'codeView', keys: ['mod', 'E'] },
      { id: 'codeSave', keys: ['mod', 'S'] },
      { id: 'codeDiscard', keys: ['Esc'] },
      { id: 'stepSave', keys: ['mod', 'S'] },
    ],
  },
  {
    id: 'debugger',
    items: [
      { id: 'run', keys: ['mod', 'Enter'] },
      { id: 'next', keys: ['mod', 'N'] },
      { id: 'nextPass', keys: ['mod', 'shift', 'N'] },
      { id: 'stepOver', keys: ['mod', 'O'] },
      { id: 'stepOut', keys: ['mod', 'shift', 'O'] },
      { id: 'pause', keys: ['mod', 'P'] },
      { id: 'stop', keys: ['mod', 'S'] },
      { id: 'goToRow', keys: ['mod', 'G'] },
      { id: 'exit', keys: ['Esc'] },
    ],
  },
  {
    id: 'appOverview',
    items: [{ id: 'export', keys: ['mod', 'E'] }],
  },
  {
    id: 'appBuilder',
    items: [
      { id: 'save', keys: ['mod', 'S'] },
      { id: 'undo', keys: ['mod', 'Z'] },
      { id: 'redo', keys: ['mod', 'shift', 'Z'] },
      { id: 'copy', keys: ['mod', 'C'] },
      { id: 'paste', keys: ['mod', 'V'] },
      { id: 'duplicate', keys: ['mod', 'D'] },
      { id: 'remove', keys: ['Delete'] },
      { id: 'deselect', keys: ['Esc'] },
    ],
  },
  {
    id: 'projectMap',
    items: [
      { id: 'undo', keys: ['mod', 'Z'] },
      { id: 'redo', keys: ['mod', 'shift', 'Z'] },
      { id: 'copy', keys: ['mod', 'C'] },
      { id: 'paste', keys: ['mod', 'V'] },
      { id: 'duplicate', keys: ['mod', 'D'] },
      { id: 'removePlanned', keys: ['Delete'] },
      { id: 'deselect', keys: ['Esc'] },
    ],
  },
  {
    id: 'fields',
    items: [{ id: 'expand', keys: ['mod', 'shift', 'E'] }],
  },
];

const isMac = navigator.userAgent.includes('Mac');

function label(key: Key): string {
  if (key === 'mod') return isMac ? '⌘' : 'Ctrl';
  if (key === 'shift') return isMac ? '⇧' : 'Shift';
  if (key === 'Enter') return isMac ? '↵' : 'Enter';
  if (key === 'Delete') return isMac ? '⌫' : 'Delete';
  return key;
}
</script>

<template>
  <section class="space-y-6" data-testid="shortcuts-page">
    <div>
      <div class="text-sm font-medium">{{ t('settings.shortcuts.title') }}</div>
      <div class="text-xs text-muted-foreground mt-0.5">{{ t('settings.shortcuts.description') }}</div>
    </div>

    <div v-for="group in GROUPS" :key="group.id" class="space-y-2">
      <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {{ t(`settings.shortcuts.groups.${group.id}`) }}
      </div>
      <div class="rounded-lg border divide-y">
        <div
          v-for="item in group.items"
          :key="item.id"
          class="flex items-center justify-between gap-4 px-4 py-2.5"
        >
          <span class="text-sm">{{ t(`settings.shortcuts.items.${group.id}.${item.id}`) }}</span>
          <span class="flex shrink-0 items-center gap-1">
            <kbd
              v-for="(key, i) in item.keys"
              :key="i"
              class="inline-flex h-6 min-w-6 select-none items-center justify-center rounded border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground"
            >
              {{ label(key) }}
            </kbd>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
