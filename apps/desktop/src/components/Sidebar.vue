<script setup lang="ts">
import { computed, onMounted, onUnmounted, type Component } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  House,
  Workflow,
  Folders,
  CalendarClock,
  AppWindow,
  Variable,
  Compass,
  Settings,
  CircleHelp,
  History,
  Trash2,
  Boxes,
  Bot,
  Tags,
  ShieldCheck,
} from 'lucide-vue-next';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarHeader,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { useColorMode } from '@vueuse/core';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher.vue';
import SidebarNavItem from '@/components/SidebarNavItem.vue';
import { usePluginStore } from '@/store/pluginStore';
import { useApprovalsStore } from '@/store/approvalsStore';
import { useHubUpdatesStore, type HubUpdateEvent } from '@/store/hubUpdatesStore';
import { toast } from '@/components/ui/sonner';
import type { PendingApproval } from '@/components/approvals/ApprovalCard.vue';

const mode = useColorMode();
const { t } = useI18n();
const pluginStore = usePluginStore();
const approvals = useApprovalsStore();
const hubUpdates = useHubUpdatesStore();
const router = useRouter();

type NavItem = {
  title: string;
  url: string;
  icon: Component;
  badge?: number;
  external?: boolean;
};
type NavGroup = { key: string; label?: string; items: NavItem[] };

// Build, operate, shared resources. Settings and Help sit at the bottom; Workspaces
// is reached from the switcher in the footer.
const groups = computed<NavGroup[]>(() => [
  {
    key: 'home',
    items: [{ title: t('nav.dashboard'), url: '/', icon: House }],
  },
  {
    key: 'build',
    label: t('nav.groups.build'),
    items: [
      { title: t('nav.tasks'), url: '/tasks', icon: Workflow },
      { title: t('nav.apps'), url: '/apps', icon: AppWindow },
      { title: t('nav.projects'), url: '/projects', icon: Folders },
      { title: t('nav.agent'), url: '/agent', icon: Bot },
    ],
  },
  {
    key: 'operate',
    label: t('nav.groups.operate'),
    items: [
      { title: t('nav.runs'), url: '/activity', icon: History },
      {
        title: t('nav.approvals'),
        url: '/approvals',
        icon: ShieldCheck,
        badge: approvals.count || undefined,
      },
      { title: t('nav.schedules'), url: '/schedules', icon: CalendarClock },
    ],
  },
  {
    key: 'resources',
    label: t('nav.groups.resources'),
    items: [
      { title: t('nav.globalVariables'), url: '/variables', icon: Variable },
      { title: t('nav.tags'), url: '/tags', icon: Tags },
      {
        title: t('nav.plugins'),
        url: '/plugins',
        icon: Boxes,
        badge: pluginStore.attentionCount || undefined,
      },
      { title: t('nav.hub'), url: '/hub', icon: Compass, badge: hubUpdates.unread || undefined },
      { title: t('nav.trash'), url: '/trash', icon: Trash2 },
    ],
  },
]);

const bottomItems = computed<NavItem[]>(() => [
  { title: t('nav.settings'), url: '/settings', icon: Settings },
  { title: t('nav.help'), url: 'https://tipeline.com/docs', icon: CircleHelp, external: true },
]);

// New approval requests: a toast while Tipeline is in front, a system notification
// otherwise. Started here because the sidebar only exists in the main window — app
// windows opened on their own don't notify a second time.
function announce(added: PendingApproval[]) {
  const openPage = () => {
    window.focus();
    router.push('/approvals');
  };
  const title = added.length === 1 ? added[0].title : t('approvals.notifyMany', { count: added.length });
  const body = added.length === 1 ? added[0].workflowName : t('approvals.notifyManyBody');
  if (document.hasFocus() || typeof Notification === 'undefined') {
    toast(t('approvals.notifyTitle'), { description: title, action: { label: t('approvals.review'), onClick: openPage } });
    return;
  }
  const notification = new Notification(t('approvals.notifyTitle'), { body: `${title}\n${body}` });
  notification.onclick = openPage;
}

// Updates installed, held back or failed in the background, announced the same way.
function announceHubUpdates(added: HubUpdateEvent[]) {
  const openPage = () => {
    window.focus();
    router.push({ name: 'HubUpdates' });
  };
  const first = added[0];
  const title =
    added.length === 1
      ? `${first.item_name ?? first.item_identifier}: ${t(`hub.updates.kind.${first.kind}`, { from: first.from_version ?? '—', to: first.to_version ?? '—' })}`
      : t('hub.updates.notifyMany', { count: added.length });
  if (document.hasFocus() || typeof Notification === 'undefined') {
    toast(t('hub.updates.notifyTitle'), { description: title, action: { label: t('hub.updates.open'), onClick: openPage } });
    return;
  }
  const notification = new Notification(t('hub.updates.notifyTitle'), { body: title });
  notification.onclick = openPage;
}

onMounted(() => {
  pluginStore.refreshAttentionCount();
  approvals.start(announce);
  hubUpdates.start(announceHubUpdates);
});
onUnmounted(() => approvals.stop());
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader class="p-4 group-data-[collapsible=icon]:px-2">
      <div class="flex justify-center items-center gap-2 mt-3">
        <img
          v-show="mode === 'dark'"
          width="160"
          src="@shared-assets/logo-light.svg"
          class="group-data-[collapsible=icon]:hidden"
        />
        <img
          v-show="mode === 'light'"
          width="160"
          src="@shared-assets/logo-dark.svg"
          class="group-data-[collapsible=icon]:hidden"
        />
        <img
          v-show="mode === 'dark'"
          width="24"
          src="@shared-assets/logo-icon-light.svg"
          class="hidden group-data-[collapsible=icon]:block"
        />
        <img
          v-show="mode === 'light'"
          width="24"
          src="@shared-assets/logo-icon-dark.svg"
          class="hidden group-data-[collapsible=icon]:block"
        />
      </div>
    </SidebarHeader>
    <SidebarContent class="p-2 group-data-[collapsible=icon]:p-0">
      <SidebarGroup v-for="group in groups" :key="group.key">
        <SidebarGroupLabel v-if="group.label">{{ group.label }}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarNavItem v-for="item in group.items" :key="item.url" :item="item" />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <SidebarGroup class="mt-auto">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarNavItem v-for="item in bottomItems" :key="item.url" :item="item" />
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter class="p-2 border-t">
      <WorkspaceSwitcher />
    </SidebarFooter>
  </Sidebar>
</template>
