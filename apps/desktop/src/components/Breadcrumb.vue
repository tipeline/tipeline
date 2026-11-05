<script setup lang="ts">
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useTaskStore } from '@/store/task';
import { useAppStore } from '@/store/app';
import { useProjectStore } from '@/store/project';
import { usePluginStore } from '@/store/pluginStore';
import { useConnectionStore } from '@/store/connectionStore';
import { useRoute, RouteRecordNormalized } from 'vue-router';
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const taskStore = useTaskStore();
const appStore = useAppStore();
const projectStore = useProjectStore();
const pluginStore = usePluginStore();
const connectionStore = useConnectionStore();

const router = useRouter();
const route = useRoute();
const { t } = useI18n();

const navigateTo = (path: string) => {
  router.push(path);
};

// route.params is the merged param set of the whole matched chain (e.g. both
// `tid` and `pipelineId` while on PipelineDetail). Resolving an ancestor route
// with the full set makes Vue Router warn about params that route's own path
// pattern doesn't declare, so scope down to just the keys that path uses.
const paramsForPath = (path: string, allParams: Record<string, any>) => {
  const keys = [...path.matchAll(/:(\w+)/g)].map((m) => m[1]);
  return Object.fromEntries(keys.map((key) => [key, allParams[key]]));
};

const breadcrumbs = computed(() => {
  const matchedRoutes = route.matched;
  const crumbs: any = [];

  if (route.path.startsWith('/tasks/')) {
    crumbs.push({ label: t('nav.tasks'), path: '/tasks' });
  }

  if (route.path.startsWith('/apps/')) {
    crumbs.push({ label: t('nav.apps'), path: '/apps' });
  }

  if (route.path.startsWith('/settings/workspaces/')) {
    crumbs.push({ label: t('nav.workspaces'), path: '/settings/workspaces' });
  }

  if (route.path.startsWith('/projects/')) {
    crumbs.push({ label: t('projects.title'), path: '/projects' });
  }

  if (route.path.startsWith('/plugins/')) {
    crumbs.push({ label: t('plugins.title'), path: '/plugins' });
  }

  matchedRoutes.forEach((matchedRoute) => {
    if (matchedRoute.meta && matchedRoute.meta.breadcrumb) {
      const breadcrumb = matchedRoute.meta.breadcrumb;
      const path = matchedRoute.name
        ? router.resolve({
            name: matchedRoute.name as string,
            params: paramsForPath(matchedRoute.path, route.params),
          }).path
        : matchedRoute.path;
      let label = '';

      if (typeof breadcrumb === 'function') {
        if (matchedRoute.meta.parent) {
          crumbs.push({
            label: t('tasks.tabRuns'),
            path: router.resolve({ name: 'TaskHistory', params: { tid: route.params.tid } }).path,
          });
        }

        if (matchedRoute.meta.showTaskName && taskStore.currentTask.name) {
          const tid = route.params.tid as string;
          crumbs.push({ label: taskStore.currentTask.name, path: `/tasks/${tid}` });
        }

        if (matchedRoute.meta.showAppName && appStore.currentApp.name) {
          label = breadcrumb(appStore.currentApp.name, path);
        } else if (matchedRoute.meta.showProjectName && projectStore.currentProject.name) {
          label = breadcrumb(projectStore.currentProject.name, path);
        } else if (matchedRoute.meta.showPluginName && pluginStore.currentPlugin.name) {
          label = breadcrumb(pluginStore.currentPlugin.name, path);
        } else if (matchedRoute.meta.showWorkspaceName) {
          const connection = connectionStore.connections.find((c) => c.id === route.params.id);
          label = breadcrumb(connection?.name ?? '', path);
        } else {
          label = breadcrumb(taskStore.currentTask.name, path);
        }
      } else if (typeof breadcrumb === 'string') {
        label = breadcrumb;
      }

      crumbs.push({
        label,
        path,
      });
    }
  });

  return crumbs;
});
</script>
<template>
  <Breadcrumb>
    <BreadcrumbList>
      <BreadcrumbItem>
        <BreadcrumbLink @click.prevent="navigateTo('/')" style="cursor: pointer"
          >{{ t('nav.dashboard') }}</BreadcrumbLink
        >
      </BreadcrumbItem>
      <template v-for="(crumb, index) in breadcrumbs" :key="index">
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink
            v-if="index !== breadcrumbs.length - 1"
            @click.prevent="navigateTo(crumb.path)"
            style="cursor: pointer"
          >
            {{ crumb.label }}
          </BreadcrumbLink>
          <BreadcrumbPage v-else>
            {{ crumb.label }}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>
