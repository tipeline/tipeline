<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { RunCacheChoice } from '@/utils/stepCache';
import { useIcon } from '@/composables/useIcon';
const { getIconComponent } = useIcon();
const { t } = useI18n();

const props = defineProps<{
  isRunning: boolean;
  isPaused: boolean;
  hasOrderingErrors?: boolean;
  /** Shown only when a step is cached: how the next run uses cached results. */
  hasCachedSteps?: boolean;
  /** Paused inside a loop or branch: "Next pass" runs the rest of it. */
  canNextPass?: boolean;
  /** Paused before a sub-workflow (or a loop, a branch): "Step over" runs it to its end. */
  canStepOver?: boolean;
  /** Paused inside a sub-workflow: "Step out" runs the rest of it. */
  canStepOut?: boolean;
}>();

const cacheMode = defineModel<RunCacheChoice>('cacheMode', { default: 'use' });

const emit = defineEmits(['run', 'next', 'nextPass', 'stepOver', 'stepOut', 'pause', 'stop', 'exit']);

const idle    = computed(() => !props.isRunning && !props.isPaused);
const running = computed(() =>  props.isRunning && !props.isPaused);
const paused  = computed(() =>  props.isPaused);
</script>

<template>
  <div class="flex items-center gap-1">
    <!-- Only there while paused at a loop, a branch or a sub-workflow. They come first because the
         bar is right-aligned: showing up here never moves Run, Next step and the rest under the cursor. -->
    <template v-if="props.canNextPass || props.canStepOver || props.canStepOut">
      <Button
        v-if="props.canNextPass"
        variant="ghost"
        type="button"
        :title="t('builder.nextPassHint')"
        data-testid="debug-next-pass"
        @click="emit('nextPass')"
      >
        <component :is="getIconComponent('Repeat')" class="w-4 h-4" />{{ t('builder.nextPass') }}
        <kbd
          class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
        >
          <span class="text-xs">⇧⌘</span>N
        </kbd>
      </Button>

      <Button
        v-if="props.canStepOver"
        variant="ghost"
        type="button"
        :title="t('builder.stepOverHint')"
        data-testid="debug-step-over"
        @click="emit('stepOver')"
      >
        <component :is="getIconComponent('RedoDot')" class="w-4 h-4" />{{ t('builder.stepOver') }}
        <kbd
          class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
        >
          <span class="text-xs">⌘</span>O
        </kbd>
      </Button>

      <Button
        v-if="props.canStepOut"
        variant="ghost"
        type="button"
        :title="t('builder.stepOutHint')"
        data-testid="debug-step-out"
        @click="emit('stepOut')"
      >
        <component :is="getIconComponent('ArrowUpFromDot')" class="w-4 h-4" />{{ t('builder.stepOut') }}
        <kbd
          class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
        >
          <span class="text-xs">⇧⌘</span>O
        </kbd>
      </Button>

      <div class="w-px h-5 bg-border mx-1" />
    </template>

    <!-- The main action: Run, or Continue while paused. -->
    <Button
      variant="default"
      type="button"
      :disabled="running || props.hasOrderingErrors"
      @click="emit('run')"
    >
      <component :is="getIconComponent('Play')" class="w-4 h-4" />{{ paused ? t('builder.continue') : t('builder.run') }}
      <kbd
        class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border border-primary-foreground/20 bg-primary-foreground/10 px-1.5 font-mono text-[10px] font-medium text-primary-foreground/80 opacity-100"
      >
        <span class="text-xs">⌘</span>⏎
      </kbd>
    </Button>

    <Button
      variant="ghost"
      type="button"
      :disabled="running || props.hasOrderingErrors"
      @click="emit('next')"
    >
      <component :is="getIconComponent('ArrowRightToLine')" class="w-4 h-4" />{{ t('builder.nextAction') }}
      <kbd
        class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
      >
        <span class="text-xs">⌘</span>N
      </kbd>
    </Button>

    <Button
      variant="ghost"
      type="button"
      :disabled="!running"
      @click="emit('pause')"
    >
      <component :is="getIconComponent('Pause')" class="w-4 h-4" />{{ t('builder.pause') }}
      <kbd
        class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
      >
        <span class="text-xs">⌘</span>P
      </kbd>
    </Button>

    <Button
      variant="ghost"
      type="button"
      :disabled="idle"
      @click="emit('stop')"
    >
      <component :is="getIconComponent('Square')" class="w-4 h-4" />{{ t('builder.stop') }}
      <kbd
        class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
      >
        <span class="text-xs">⌘</span>S
      </kbd>
    </Button>

    <template v-if="props.hasCachedSteps">
      <div class="w-px h-5 bg-border mx-1" />
      <!-- Applies to the next run (Run or Next from the start), so it's locked while one is going. -->
      <Select v-model="cacheMode" :disabled="!idle">
        <SelectTrigger class="h-8 w-auto gap-2 text-xs" :title="t('cache.debugHint')">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="use">{{ t('cache.debugUse') }}</SelectItem>
          <SelectItem value="bypass">{{ t('cache.runWithoutCache') }}</SelectItem>
          <SelectItem value="refresh">{{ t('cache.runAndRefresh') }}</SelectItem>
        </SelectContent>
      </Select>
    </template>

    <div class="w-px h-5 bg-border mx-1" />

    <Button
      variant="ghost"
      type="button"
      :disabled="running"
      @click="emit('exit')"
    >
      <component :is="getIconComponent('LogOut')" class="w-4 h-4" />{{ t('builder.exit') }}
      <kbd
        class="pointer-events-none ml-1 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
      >
        Esc
      </kbd>
    </Button>
  </div>
</template>
