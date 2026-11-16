import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import { useSession } from './session';

// Tabs as in the designs: Home, Workflows, Assistant, Inbox (Apps comes with phase 2).
// Runs, Schedules and More open from Home, so they stack under it.
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/tabs/home' },
  { path: '/connect', component: () => import('./pages/ConnectPage.vue'), meta: { public: true } },
  {
    path: '/tabs/',
    component: () => import('./pages/TabsPage.vue'),
    children: [
      { path: '', redirect: '/tabs/home' },
      { path: 'home', component: () => import('./pages/HomePage.vue') },
      { path: 'home/more', component: () => import('./pages/MorePage.vue') },
      { path: 'home/runs', component: () => import('./pages/RunsPage.vue') },
      { path: 'home/runs/:pipelineIdentifier', component: () => import('./pages/RunPage.vue'), props: true },
      { path: 'home/schedules', component: () => import('./pages/SchedulesPage.vue') },
      { path: 'workflows', component: () => import('./pages/WorkflowsPage.vue') },
      { path: 'workflows/:identifier', component: () => import('./pages/WorkflowPage.vue'), props: true },
      { path: 'assistant', component: () => import('./pages/AssistantPage.vue') },
      { path: 'inbox', component: () => import('./pages/InboxPage.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/tabs/home' },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach((to: RouteLocationNormalized) => {
  const session = useSession();
  if (!to.meta.public && !session.signedIn()) return '/connect';
  if (to.path === '/connect' && session.signedIn()) return '/tabs/home';
  return true;
});
