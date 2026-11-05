// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { i18n } from '@/i18n';

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { aid: 'app-9' } }),
  useRouter: () => ({ push: vi.fn() }),
}));
// The running app isn't under test.
vi.mock('@/components/app/AppRunner.vue', () => ({ default: defineComponent({ setup: () => () => h('div') }) }));

import AppDetail from '@/pages/apps/AppDetail.vue';

describe('App Edit dialog — File access', () => {
  it('shows this computer\'s setting for the app and saves the switch', async () => {
    let trusted = false;
    const invoke = vi.fn(async (channel: string, arg: any) => {
      if (channel === 'appDetail') return { identifier: 'app-9', name: 'Invoices', source: JSON.stringify({ pages: [] }), metadata: {} };
      if (channel === 'app:file-trust:get') return trusted;
      if (channel === 'app:file-trust:set') return (trusted = arg.trusted);
      return {};
    });
    (window as any).ipcRenderer = { invoke, on: vi.fn(), off: vi.fn() };
    const w = mount(AppDetail, { attachTo: document.body, global: { plugins: [i18n, createPinia()], stubs: { Page: { template: '<div><slot name="menu"/><slot name="content"/></div>' } } } });
    await flushPromises();

    await w.findAll('button').find((b) => b.text() === 'Edit')!.trigger('click');
    await flushPromises();
    const box = document.body.querySelector('[data-testid="file-access"]')!;
    expect(box.textContent).toContain('only show and open files inside ~/Tipeline');
    expect(invoke).toHaveBeenCalledWith('app:file-trust:get', { appIdentifier: 'app-9' });

    (box.querySelector('button[role="switch"]') as HTMLElement).click();
    await flushPromises();
    expect(box.textContent).toContain('anywhere on this computer');
    expect(box.textContent).toContain('Only turn this on for apps you trust');

    const save = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Save') as HTMLElement;
    save.click();
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith('app:file-trust:set', { appIdentifier: 'app-9', trusted: true });
    expect(trusted).toBe(true);
    w.unmount();
    delete (window as any).ipcRenderer;
  });
});
