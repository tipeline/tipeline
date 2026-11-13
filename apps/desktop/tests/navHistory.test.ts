import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import {
  backLabel,
  canGoBack,
  canGoForward,
  forwardLabel,
  navHistory,
  resetHistory,
  setCurrentLabel,
  trackHistory,
} from '@/router/navHistory';

const Page = { template: '<div />' };
let blockLeavingB = false;

function makeRouter(): Router {
  return createRouter({
    history: trackHistory(createMemoryHistory()),
    routes: [
      { path: '/', component: Page },
      { path: '/a', component: Page },
      { path: '/b', component: Page },
      { path: '/c', component: Page },
    ],
  });
}

// router.back()/forward() resolve asynchronously through the history listener.
const settle = () => new Promise((r) => setTimeout(r, 0));

let router: Router;

beforeEach(async () => {
  navHistory.position = 0;
  navHistory.entries = [{ label: '' }];
  navHistory.floor = 0;
  blockLeavingB = false;
  router = makeRouter();
  router.beforeEach((_to, from) => !(blockLeavingB && from.path === '/b'));
  await router.push('/');
  await router.isReady();
});

describe('navHistory', () => {
  it('starts with nowhere to go', () => {
    expect(canGoBack()).toBe(false);
    expect(canGoForward()).toBe(false);
  });

  it('goes back and forward with labels', async () => {
    setCurrentLabel('Home');
    await router.push('/a');
    setCurrentLabel('Project map');
    await router.push('/b');
    setCurrentLabel('Workflow');

    expect(canGoBack()).toBe(true);
    expect(backLabel()).toBe('Project map');

    router.back();
    await settle();
    expect(router.currentRoute.value.path).toBe('/a');
    expect(canGoForward()).toBe(true);
    expect(forwardLabel()).toBe('Workflow');
    expect(backLabel()).toBe('Home');

    router.forward();
    await settle();
    expect(router.currentRoute.value.path).toBe('/b');
    expect(canGoForward()).toBe(false);
  });

  it('drops forward entries after a new navigation', async () => {
    await router.push('/a');
    await router.push('/b');
    router.back();
    await settle();
    await router.push('/c');
    expect(canGoForward()).toBe(false);
    expect(navHistory.entries).toHaveLength(3);
  });

  it('replace keeps the position', async () => {
    await router.push('/a');
    await router.replace('/b');
    expect(navHistory.position).toBe(1);
    router.back();
    await settle();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('stays in step when a guard cancels Back', async () => {
    await router.push('/a');
    await router.push('/b');
    blockLeavingB = true;
    router.back();
    await settle();
    expect(router.currentRoute.value.path).toBe('/b');
    expect(navHistory.position).toBe(2);
    expect(canGoForward()).toBe(false);

    blockLeavingB = false;
    router.back();
    await settle();
    expect(router.currentRoute.value.path).toBe('/a');
  });

  it('reset stops Back at the current page', async () => {
    await router.push('/a');
    await router.push('/b');
    router.back();
    await settle();
    resetHistory();
    expect(canGoBack()).toBe(false);
    expect(canGoForward()).toBe(false);
    await router.push('/c');
    expect(canGoBack()).toBe(true);
    router.back();
    await settle();
    expect(router.currentRoute.value.path).toBe('/a');
    expect(canGoBack()).toBe(false);
  });
});
