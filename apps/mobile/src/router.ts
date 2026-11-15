import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteLocationNormalized, RouteRecordRaw } from 'vue-router';
import { useSession } from './session';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/tabs/workflows' },
  { path: '/connect', component: () => import('./pages/ConnectPage.vue'), meta: { public: true } },
  {
    path: '/tabs/',
    component: () => import('./pages/TabsPage.vue'),
    children: [
      { path: '', redirect: '/tabs/workflows' },
      { path: 'workflows', component: () => import('./pages/WorkflowsPage.vue') },
      { path: 'workflows/:identifier', component: () => import('./pages/WorkflowPage.vue'), props: true },
      { path: 'account', component: () => import('./pages/AccountPage.vue') },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/tabs/workflows' },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach((to: RouteLocationNormalized) => {
  const session = useSession();
  if (!to.meta.public && !session.signedIn()) return '/connect';
  if (to.path === '/connect' && session.signedIn()) return '/tabs/workflows';
  return true;
});
