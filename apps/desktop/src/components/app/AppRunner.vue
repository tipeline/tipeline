<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AppSource } from '@tipeline/schemas';
import Dialog from '@/components/Dialog.vue';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import AppPageView from './AppPageView.vue';
import { useIcon } from '@/composables/useIcon';
import type { AppModalLook, AppRuntimeHost } from '@/composables/useAppRuntime';

// A running App: page menu, the current page, and a page shown by `openModal` as a
// dialog or a drawer (a panel sliding in from the side). Both pages share app
// `state`. Used by the app page and by the builder's Preview.
const props = defineProps<{
  appIdentifier: string;
  source: AppSource;
  /** Page to open first (defaults to the first page). */
  initialPageId?: string | null;
  /**
   * A row on top with the pages as tabs, "App", author and version, so the app
   * reads as an app running inside Tipeline rather than a Tipeline page. The
   * app's detail page sets it; the run-only window and the builder's Preview don't.
   */
  showAppBar?: boolean;
  author?: string | null;
  version?: string | null;
}>();

const { t } = useI18n();
const { getIconComponent } = useIcon();

const pages = computed(() => props.source.pages);
const menuPages = computed(() => pages.value.filter((p) => p.showInMenu));

const pageId = ref<string | null>(null);
watch(
  () => props.source,
  (src) => {
    if (src.pages.some((p) => p.id === pageId.value)) return;
    pageId.value =
      src.pages.find((p) => p.id === props.initialPageId)?.id ??
      src.pages[0]?.id ??
      null;
  },
  { immediate: true }
);
const currentPage = computed(
  () => pages.value.find((p) => p.id === pageId.value) ?? null
);

// The app row: "by Ana · v1.4", leaving out whatever the app doesn't set.
const barMeta = computed(() => {
  const parts: string[] = [];
  const author = props.author?.trim();
  const version = props.version?.trim();
  if (author) parts.push(t('apps.bar.by', { author }));
  if (version) parts.push(/^v/i.test(version) ? version : `v${version}`);
  return parts.join(' · ');
});

// App-wide state, seeded from the app's `state` defaults once per running app.
const appState = reactive<Record<string, unknown>>(
  JSON.parse(JSON.stringify(props.source.state ?? {}))
);
const pageParams = ref<Record<string, unknown>>({});

// The page shown as a dialog. Its promise resolves true when closed by `closeModal`,
// false when dismissed (or replaced / navigated away).
const modal = shallowRef<{
  pageId: string;
  params: Record<string, unknown>;
  look: AppModalLook;
  resolve: (ok: boolean) => void;
} | null>(null);
const drawer = computed(() => modal.value?.look.display === 'drawer');

// Widths per size (literal classes, so Tailwind finds them).
const DIALOG_WIDTH = {
  sm: 'sm:max-w-[480px]',
  md: 'sm:max-w-[700px]',
  lg: 'sm:max-w-[960px]',
  xl: 'sm:max-w-[1200px]',
} as const;
const DRAWER_WIDTH = {
  sm: 'sm:max-w-[360px]',
  md: 'sm:max-w-[480px]',
  lg: 'sm:max-w-[720px]',
  xl: 'sm:max-w-[960px]',
} as const;
const width = computed(() => (drawer.value ? DRAWER_WIDTH : DIALOG_WIDTH)[modal.value?.look.size ?? 'md']);
const modalPage = computed(
  () => pages.value.find((p) => p.id === modal.value?.pageId) ?? null
);

function closeModal(ok: boolean) {
  const current = modal.value;
  modal.value = null;
  current?.resolve(ok);
}

const mainHost: AppRuntimeHost = {
  navigate: (id, params) => {
    closeModal(false);
    pageParams.value = params;
    pageId.value = id;
  },
  openModal: (id, params, look = {}) =>
    new Promise<boolean>((resolve) => {
      closeModal(false);
      modal.value = { pageId: id, params, look, resolve };
    }),
  closeModal: () => {},
};

// From inside the dialog: navigating leaves the dialog; dialogs don't stack.
const modalHost: AppRuntimeHost = {
  navigate: mainHost.navigate,
  openModal: async () => false,
  closeModal: () => closeModal(true),
};

const modalOpen = computed({
  get: () => !!modal.value && !drawer.value,
  set: (open) => {
    if (!open) closeModal(false);
  },
});
const drawerOpen = computed({
  get: () => !!modal.value && drawer.value,
  set: (open) => {
    if (!open) closeModal(false);
  },
});
</script>

<template>
  <Dialog v-model="modalOpen" :title="modalPage?.name ?? ''" :content-class="width">
    <div class="min-h-40 overflow-x-clip">
      <AppPageView
        v-if="modal && modalPage && !drawer"
        :key="modal.pageId"
        :app-identifier="appIdentifier"
        :source="source"
        :page-id="modal.pageId"
        :params="modal.params"
        :state="appState"
        :host="modalHost"
      />
    </div>
  </Dialog>

  <Sheet v-model:open="drawerOpen">
    <SheetContent
      :side="modal?.look.side ?? 'right'"
      :class="['w-full gap-0', width]"
      data-testid="app-drawer"
    >
      <SheetHeader class="shrink-0 border-b pr-12">
        <SheetTitle>{{ modalPage?.name ?? '' }}</SheetTitle>
        <!-- For screen readers (and Reka's check): what this panel is. -->
        <SheetDescription class="sr-only">{{ modalPage?.name ?? '' }}</SheetDescription>
      </SheetHeader>
      <div class="flex-1 min-h-0 overflow-y-auto overflow-x-clip p-4" data-app-fill-area>
        <AppPageView
          v-if="modal && modalPage && drawer"
          :key="modal.pageId"
          :app-identifier="appIdentifier"
          :source="source"
          :page-id="modal.pageId"
          :params="modal.params"
          :state="appState"
          :host="modalHost"
        />
      </div>
    </SheetContent>
  </Sheet>

  <div class="flex flex-col h-full min-h-0">
    <!-- Pages as tabs, the same everywhere the app runs. On the app's detail page
         (showAppBar) the row is always there, page count aside, and also says "App",
         so adding a page moves nothing. -->
    <div
      v-if="showAppBar || menuPages.length > 1"
      class="flex items-end justify-between gap-3 border-b mb-3 shrink-0"
      :data-testid="showAppBar ? 'app-bar' : undefined"
    >
      <div class="flex items-end gap-4 min-w-0 overflow-x-auto">
        <template v-if="menuPages.length > 1">
          <button
            v-for="page in menuPages"
            :key="page.id"
            type="button"
            class="flex items-center gap-1.5 pt-1.5 pb-2 px-0.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors focus-visible:outline-none focus-visible:bg-accent"
            :class="
              pageId === page.id
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            "
            :aria-current="pageId === page.id ? 'page' : undefined"
            @click="mainHost.navigate(page.id, {})"
          >
            <component
              :is="getIconComponent(page.icon ?? '')"
              v-if="page.icon && getIconComponent(page.icon)"
              class="size-3.5"
            />
            {{ page.name }}
          </button>
        </template>
        <span v-else-if="currentPage" class="pt-1.5 pb-2.5 px-0.5 text-sm font-semibold truncate">
          {{ currentPage.name }}
        </span>
      </div>
      <div
        v-if="showAppBar"
        class="flex items-center gap-2 shrink-0 pb-2.5 text-xs text-muted-foreground"
      >
        <span
          class="rounded border bg-card px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide"
        >
          {{ t('apps.bar.app') }}
        </span>
        <span v-if="barMeta">{{ barMeta }}</span>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto overflow-x-hidden" data-app-fill-area>
      <AppPageView
        v-if="currentPage"
        :app-identifier="appIdentifier"
        :source="source"
        :page-id="currentPage.id"
        :params="pageParams"
        :state="appState"
        :host="mainHost"
      />
      <div
        v-else
        class="flex items-center justify-center h-full text-muted-foreground text-sm"
      >
        {{ t('apps.noPages') }}
      </div>
    </div>
  </div>
</template>
