import { createMemoryHistory, createRouter } from 'vue-router';
import { trackHistory } from '@/router/navHistory';

// Pages
import Dashboard from '@/pages/Dashboard.vue';
import Activity from '@/pages/Activity.vue';
import Approvals from '@/pages/Approvals.vue';
const Agent = () => import('@/pages/Agent.vue');

import AppsList from '@/pages/apps/AppsList.vue';
import AppEdit from '@/pages/apps/AppEdit.vue';
import AppDetail from '@/pages/apps/AppDetail.vue';
import AppRun from '@/pages/apps/AppRun.vue';

import Settings from '@/pages/Settings.vue';
import SettingsAppearancePage from '@/pages/settings/SettingsAppearancePage.vue';
import SettingsAgentPage from '@/pages/settings/SettingsAgentPage.vue';
import SettingsDefaultsPage from '@/pages/settings/SettingsDefaultsPage.vue';
import SettingsBackupPage from '@/pages/settings/SettingsBackupPage.vue';
import SettingsAboutPage from '@/pages/settings/SettingsAboutPage.vue';
import ConnectionsPage from '@/pages/settings/ConnectionsPage.vue';
import WorkspaceDetailPage from '@/pages/settings/WorkspaceDetailPage.vue';
import SettingsHubsPage from '@/pages/settings/SettingsHubsPage.vue';
import SettingsCachePage from '@/pages/settings/SettingsCachePage.vue';
import SettingsRunHistoryPage from '@/pages/settings/SettingsRunHistoryPage.vue';
import Schedules from '@/pages/Schedules.vue';
import VariableList from '@/pages/variables/VariableList.vue';
import TagList from '@/pages/tags/TagList.vue';
import TrashList from '@/pages/trash/TrashList.vue';

import Hub from '@/pages/Hub.vue';
import HubApps from '@/components/hub/HubApps.vue';
import HubTasks from '@/components/hub/HubTasks.vue';
import HubPlugins from '@/components/hub/HubPlugins.vue';
import HubUpdates from '@/components/hub/HubUpdates.vue';

const PluginsList = () => import('@/pages/plugins/PluginsList.vue');
const PluginDetail = () => import('@/pages/plugins/PluginDetail.vue');
import ProjectsList from '@/pages/projects/ProjectsList.vue';
import ProjectDetail from '@/pages/projects/ProjectDetail.vue';
import ProjectsMap from '@/pages/projects/ProjectsMap.vue';
import ProjectMapEditor from '@/pages/projects/ProjectMapEditor.vue';
import TasksList from '@/pages/tasks/TasksList.vue';
import TaskDetail from '@/pages/tasks/TaskDetail.vue';
import TaskEdit from '@/pages/tasks/TaskEdit.vue';

// Task tabs
import TaskOverviewTab from '@/components/task/TaskOverviewTab.vue';
import TaskHistoryTab from '@/components/task/TaskHistoryTab.vue';
import TaskVersionsTab from '@/components/task/TaskVersionsTab.vue';
import TaskHistoryDetailTab from '@/components/task/TaskHistoryDetailTab.vue';
import { openNewAppDialog, openNewTaskDialog } from '@/composables/useNewItemDialogs';

// Routes showing a single workspace item set `meta.workspaceFallback` to the list page the user
// is sent to when the workspace changes, since that item may not exist in the new workspace.
const routes = [
  // Dashboard
  {
    path: '/',
    component: Dashboard,
    meta: { layout: 'DefaultLayout' },
  },
  // Activity
  {
    path: '/activity',
    name: 'Activity',
    component: Activity,
    meta: { breadcrumb: 'Runs', layout: 'DefaultLayout' },
  },
  // Approvals — runs waiting at an approval step
  {
    path: '/approvals',
    name: 'Approvals',
    component: Approvals,
    meta: { breadcrumb: 'Approvals', layout: 'DefaultLayout' },
  },
  // Agent
  {
    path: '/agent',
    name: 'Agent',
    component: Agent,
    meta: { breadcrumb: 'Assistant', layout: 'DefaultLayout' },
  },
  // Projects
  {
    path: '/projects',
    name: 'Projects',
    component: ProjectsList,
    meta: { breadcrumb: 'Projects', layout: 'DefaultLayout' },
  },
  {
    path: '/projects/map',
    name: 'ProjectsMap',
    component: ProjectsMap,
    meta: { breadcrumb: 'Map', layout: 'DefaultLayout' },
  },
  // A project's map, full page like the workflow builder (EditLayout) — before '/projects/:pid'
  {
    path: '/projects/:pid/map',
    name: 'ProjectMapEditor',
    component: ProjectMapEditor,
    meta: { breadcrumb: () => 'Map', showProjectName: true, layout: 'EditLayout' },
  },
  {
    path: '/projects/:pid',
    name: 'ProjectDetail',
    component: ProjectDetail,
    meta: {
      breadcrumb: (name: string) => name,
      showProjectName: true,
      layout: 'DefaultLayout',
      workspaceFallback: { name: 'Projects' },
    },
  },
  // Tasks
  {
    path: '/tasks',
    name: 'Tasks',
    component: TasksList,
    meta: { breadcrumb: 'Workflows', layout: 'DefaultLayout' },
  },
  {
    path: '/tasks/new',
    name: 'TaskNew',
    // Creating is a dialog now (see useNewItemDialogs) — the old link opens it over the list.
    redirect: () => {
      openNewTaskDialog();
      return { name: 'Tasks' };
    },
  },
  // Task edit route - MUST come BEFORE the general task route (EditLayout)
  {
    path: '/tasks/:tid/edit',
    name: 'TaskEdit',
    component: TaskEdit,
    meta: {
      breadcrumb: () => 'Builder',
      showTaskName: true,
      layout: 'EditLayout',
    },
  },
  // Task detail routes with tabs (DefaultLayout)
  {
    path: '/tasks/:tid',
    name: 'TaskDetail',
    component: TaskDetail,
    meta: {
      layout: 'DefaultLayout',
      workspaceFallback: { name: 'Tasks' },
      breadcrumb: function (value: string) {
        return value;
      },
    },
    children: [
      {
        path: '',
        name: 'TaskDetailIndex',
        redirect: { name: 'TaskOverview' },
      },
      {
        path: 'overview',
        name: 'TaskOverview',
        component: TaskOverviewTab,
      },
      {
        path: 'pipelines',
        name: 'TaskHistory',
        component: TaskHistoryTab,
        meta: { breadcrumb: 'Runs' },
      },
      {
        path: 'versions',
        name: 'TaskVersions',
        component: TaskVersionsTab,
        meta: { breadcrumb: 'Versions' },
      },
      {
        path: 'pipelines/:pipelineId',
        name: 'PipelineDetail',
        component: TaskHistoryDetailTab,
        meta: {
          breadcrumb: (label: any, route: any) => {
            return 'Run Detail';
          },
          parent: true,
        },
      },
    ],
  },
  // Schedules
  {
    path: '/schedules',
    name: 'Schedules',
    component: Schedules,
    meta: { breadcrumb: 'Schedules', layout: 'DefaultLayout' },
  },
  // Apps
  {
    path: '/apps',
    name: 'AppsList',
    component: AppsList,
    meta: { breadcrumb: 'Apps', layout: 'DefaultLayout' },
  },
  {
    path: '/apps/new',
    name: 'AppNew',
    // Creating is a dialog now (see useNewItemDialogs) — the old link opens it over the list.
    redirect: () => {
      openNewAppDialog();
      return { name: 'AppsList' };
    },
  },
  {
    path: '/apps/:aid/edit',
    name: 'AppEdit',
    component: AppEdit,
    meta: { layout: 'BuilderLayout' },
  },
  // Pages shown in their own window (see utils/detachedWindows.ts): no sidebar.
  {
    // The app on its own, in run-only mode (opened from the app page).
    path: '/window/apps/:aid',
    name: 'AppRun',
    component: AppRun,
    meta: { layout: 'StandaloneLayout' },
  },
  {
    // A run's live detail (opened from the run's page).
    path: '/window/runs/:tid/:pipelineId',
    name: 'RunWindow',
    component: TaskHistoryDetailTab,
    meta: { layout: 'StandaloneLayout' },
  },
  {
    path: '/apps/:aid',
    name: 'AppDetail',
    component: AppDetail,
    meta: {
      breadcrumb: (name: string) => name,
      showAppName: true,
      layout: 'DefaultLayout',
      workspaceFallback: { name: 'AppsList' },
    },
  },

  // Plugins
  {
    path: '/plugins',
    name: 'Plugins',
    component: PluginsList,
    meta: { breadcrumb: 'Plugins', layout: 'DefaultLayout' },
  },
  {
    path: '/plugins/:pid',
    name: 'PluginDetail',
    component: PluginDetail,
    meta: {
      breadcrumb: (name: string) => name,
      showPluginName: true,
      layout: 'DefaultLayout',
      workspaceFallback: { name: 'Plugins' },
    },
  },
  // VariableList
  {
    path: '/variables',
    name: 'Variables',
    component: VariableList,
    meta: { breadcrumb: 'Global Variables', layout: 'DefaultLayout' },
  },
  // TagList
  {
    path: '/tags',
    name: 'Tags',
    component: TagList,
    meta: { breadcrumb: 'Tags', layout: 'DefaultLayout' },
  },
  {
    path: '/trash',
    name: 'Trash',
    component: TrashList,
    meta: { breadcrumb: 'Trash', layout: 'DefaultLayout' },
  },
  {
    path: '/hub',
    name: 'Hub',
    component: Hub,
    meta: { breadcrumb: 'Hub', layout: 'DefaultLayout' },
    children: [
      {
        path: '',
        name: 'HubTasks',
        component: HubTasks,
      },
      {
        path: 'apps',
        name: 'HubApps',
        component: HubApps,
      },
      {
        path: 'plugins',
        name: 'HubPlugins',
        component: HubPlugins,
      },
      {
        path: 'updates',
        name: 'HubUpdates',
        component: HubUpdates,
      },
    ],
  },
  {
    path: '/settings',
    name: 'Settings',
    component: Settings,
    meta: { breadcrumb: 'Settings', layout: 'DefaultLayout' },
    children: [
      {
        path: '',
        name: 'SettingsAppearance',
        component: SettingsAppearancePage,
      },
      {
        path: 'defaults',
        name: 'SettingsDefaults',
        component: SettingsDefaultsPage,
      },
      {
        path: 'agent',
        name: 'SettingsAgent',
        component: SettingsAgentPage,
      },
      {
        path: 'backup',
        name: 'SettingsBackup',
        component: SettingsBackupPage,
      },
      {
        path: 'hubs',
        name: 'SettingsHubs',
        component: SettingsHubsPage,
      },
      {
        path: 'run-history',
        name: 'SettingsRunHistory',
        component: SettingsRunHistoryPage,
      },
      {
        path: 'cache',
        name: 'SettingsCache',
        component: SettingsCachePage,
      },
      {
        path: 'about',
        name: 'SettingsAbout',
        component: SettingsAboutPage,
      },
    ],
  },
  {
    path: '/settings/workspaces',
    name: 'SettingsConnections',
    component: ConnectionsPage,
    meta: { breadcrumb: 'Workspaces', layout: 'DefaultLayout' },
  },
  {
    path: '/settings/workspaces/:id',
    name: 'WorkspaceDetail',
    component: WorkspaceDetailPage,
    meta: { breadcrumb: (name: string) => name, showWorkspaceName: true, layout: 'DefaultLayout' },
  },
];

const router = createRouter({
  history: trackHistory(createMemoryHistory()),
  routes,
});

export default router;
