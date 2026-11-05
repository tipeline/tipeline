<script setup lang="ts">
import { computed, provide, toRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppAction, AppComponent, AppSource } from '@tipeline/schemas';
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
import AppPageGrid from './AppPageGrid.vue';
import {
  useAppRuntime,
  isRunningFor,
  type AppRuntimeHost,
  type ItemScope,
  type RunStatus,
} from '@/composables/useAppRuntime';
import { APP_RUNTIME } from './appRuntimeKey';
import { APP_CANVAS, APP_PAGE_GRID } from './appCanvasKey';

// One running page of an App: its runtime (component state, runnables, actions), its
// grid of widgets, and its confirmation dialog. The app detail page shows one for the
// current page and another inside a dialog for `openModal`; both share app `state`.
const props = defineProps<{
  appIdentifier: string;
  source: AppSource;
  pageId: string;
  params: Record<string, unknown>;
  state: Record<string, unknown>;
  host: AppRuntimeHost;
}>();

const { t } = useI18n();

const runtime = useAppRuntime({
  appIdentifier: toRef(props, 'appIdentifier'),
  source: toRef(props, 'source'),
  pageId: toRef(props, 'pageId'),
  params: toRef(props, 'params') as any,
  state: props.state,
  host: props.host,
});

const page = computed(
  () => props.source.pages.find((p) => p.id === props.pageId) ?? null
);

// Widgets that show run progress (Run Console) or talk to core for the app
// (Approvals) read from here.
provide(APP_RUNTIME, {
  appIdentifier: () => props.appIdentifier,
  pageId: () => props.pageId,
  runnables: runtime.runnables,
});

/** Runnables a component's event handlers run (e.g. a form's submit). */
function triggeredRunnables(component: AppComponent): string[] {
  const names = new Set<string>();
  for (const actions of Object.values(
    (component.events ?? {}) as Record<string, AppAction[]>
  )) {
    for (const action of actions)
      if (action.type === 'run') names.add(action.runnable);
  }
  return [...names];
}

// Runnables a component depends on: those its event handlers run, plus those its
// props bind to — used to show a busy state while any of them is running.
function referencedRunnables(component: AppComponent): string[] {
  const names = new Set(triggeredRunnables(component));
  for (const m of JSON.stringify(component.props ?? {}).matchAll(
    /runnables\.(\w+)/g
  ))
    names.add(m[1]);
  return [...names];
}

// Inside a list view, only the item that started a run shows busy (see isRunningFor).
function isBusy(component: AppComponent, scope?: ItemScope): boolean {
  return referencedRunnables(component).some((name) =>
    isRunningFor(runtime.runnables[name], scope)
  );
}

// The workflow run a component started, for its status line: the one running now,
// else the one that ended last. Only `run` runnables — history fetches have no steps.
function runStatus(component: AppComponent): RunStatus | null {
  let best: RunStatus | null = null;
  for (const name of triggeredRunnables(component)) {
    const def = page.value?.runnables[name];
    const st = runtime.runnables[name];
    if (def?.mode !== 'run' || !st || st.status === 'idle') continue;
    const candidate: RunStatus = {
      ...st,
      name,
      workflowIdentifier:
        props.source.workflows[def.workflow]?.identifier ?? '',
    };
    if (st.isRunning) return candidate;
    if (!best || (st.finishedAt ?? 0) > (best.finishedAt ?? 0))
      best = candidate;
  }
  return best;
}

// The page's grid, and the grids inside its containers and tabs.
provide(APP_PAGE_GRID, {
  components: () => page.value?.components ?? [],
  runtime,
  isBusy,
  runStatus,
});
provide(APP_CANVAS, { grid: AppPageGrid });

// Closing the dialog any other way (Escape, outside click, Cancel) means "no". The
// dialog's Confirm button also closes it, and Reka reports that close before our
// Confirm click handler runs — so the "no" is deferred a tick, by which time Confirm
// has already resolved the request.
const confirmOpen = computed({
  get: () => !!runtime.pendingConfirm.value,
  set: (open) => {
    if (open) return;
    const pending = runtime.pendingConfirm.value;
    setTimeout(() => {
      if (runtime.pendingConfirm.value === pending) pending?.resolve(false);
    });
  },
});
</script>

<template>
  <AlertDialog v-model:open="confirmOpen">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{
          t('apps.runtime.confirmTitle')
        }}</AlertDialogTitle>
        <AlertDialogDescription>{{
          runtime.pendingConfirm.value?.message
        }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel
          @click="runtime.pendingConfirm.value?.resolve(false)"
          >{{ t('common.cancel') }}</AlertDialogCancel
        >
        <AlertDialogAction
          @click="runtime.pendingConfirm.value?.resolve(true)"
          >{{ t('common.confirm') }}</AlertDialogAction
        >
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  <AppPageGrid v-if="page" :key="page.id" />
</template>
