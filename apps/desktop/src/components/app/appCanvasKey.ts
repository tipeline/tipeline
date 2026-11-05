import type { Component, ComputedRef, InjectionKey } from 'vue';
import type { AppComponent } from '@tipeline/schemas';
import type { ItemScope, RunStatus, useAppRuntime } from '@/composables/useAppRuntime';

/**
 * How a container or tabs widget draws the grid of its children. The runtime and the
 * builder each provide their own grid (the builder's is editable), so the same widget
 * works in both.
 */
export interface AppCanvas {
  /** Renders one grid; props: `parentId`, and `tab` inside a tabs component. */
  grid: Component;
  /** Builder only: the tab being edited in a tabs component, and switching it. */
  editorTab?: (componentId: string) => string | undefined;
  setEditorTab?: (componentId: string, tab: string) => void;
}

export const APP_CANVAS: InjectionKey<AppCanvas> = Symbol('appCanvas');

/** What the runtime's grids need from the page they draw (see AppPageGrid). */
export interface AppPageGridContext {
  components: () => AppComponent[];
  runtime: ReturnType<typeof useAppRuntime>;
  isBusy: (component: AppComponent, scope?: ItemScope) => boolean;
  runStatus: (component: AppComponent) => RunStatus | null;
}

export const APP_PAGE_GRID: InjectionKey<AppPageGridContext> = Symbol('appPageGrid');

/**
 * Set inside one item of a list view: the item its components are drawn for. The
 * runtime's grids resolve bindings (`item`, `index`) and run handlers for it.
 */
export const APP_ITEM_SCOPE: InjectionKey<ComputedRef<ItemScope>> = Symbol('appItemScope');
