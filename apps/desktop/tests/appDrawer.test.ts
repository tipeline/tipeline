// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { i18n } from '@/i18n';

// The pages themselves aren't under test: a stand-in shows which page and host it got.
const hosts: any[] = [];
vi.mock('@/components/app/AppPageView.vue', () => ({
  default: defineComponent({
    props: ['pageId', 'host', 'params', 'state', 'source', 'appIdentifier'],
    setup: (p) => {
      hosts.push(p.host);
      return () => h('div', { class: 'page', 'data-page': p.pageId });
    },
  }),
}));

import AppRunner from '@/components/app/AppRunner.vue';
import ActionEdit from '@/pages/apps/builder/components/ActionEdit.vue';

const source = {
  schemaVersion: 3,
  workflows: {},
  state: {},
  pages: [
    { id: 'main', name: 'Main', showInMenu: true, runnables: {}, events: {}, components: [] },
    { id: 'edit', name: 'Edit record', showInMenu: false, runnables: {}, events: {}, components: [] },
  ],
} as any;

describe('openModal as a drawer', () => {
  it('shows the page in a side panel of the chosen width; closeModal closes it and continues', async () => {
    hosts.length = 0;
    const w = mount(AppRunner, { props: { appIdentifier: 'a', source }, attachTo: document.body, global: { plugins: [i18n] } });
    const main = hosts[0];
    const done = main.openModal('edit', { id: 3 }, { display: 'drawer', side: 'left', size: 'lg' });
    await flushPromises();
    await nextTick();
    const drawer = document.body.querySelector('[data-testid="app-drawer"]') as HTMLElement;
    expect(drawer).not.toBeNull();
    expect(drawer.textContent).toContain('Edit record');
    expect(drawer.className).toContain('sm:max-w-[720px]');
    expect(drawer.className).toContain('slide-in-from-left');
    expect(drawer.querySelector('[data-page="edit"]')).not.toBeNull();

    hosts.at(-1).closeModal(); // the drawer page's own host
    await expect(done).resolves.toBe(true);
    w.unmount();
  });

  it('a dialog keeps its look, with a width per size', async () => {
    hosts.length = 0;
    const w = mount(AppRunner, { props: { appIdentifier: 'a', source }, attachTo: document.body, global: { plugins: [i18n] } });
    void hosts[0].openModal('edit', {}, { size: 'sm' });
    await flushPromises();
    await nextTick();
    expect(document.body.querySelector('[data-testid="app-drawer"]')).toBeNull();
    expect(document.body.innerHTML).toContain('sm:max-w-[480px]');
    w.unmount();
  });
});

describe('ActionEdit — openModal', () => {
  const mountEdit = (action: unknown) =>
    mount(ActionEdit, {
      props: { action, pages: source.pages, runnables: [], components: [] } as any,
      global: { plugins: [i18n, createPinia()] },
    });

  it('keeps a plain dialog plain, and saves only what differs from the defaults', async () => {
    const plain = mountEdit({ type: 'openModal', page: 'edit' });
    (plain.vm as any).submit();
    expect(plain.emitted('submit')![0]).toEqual([{ type: 'openModal', page: 'edit' }]);

    const drawer = mountEdit({ type: 'openModal', page: 'edit', display: 'drawer', side: 'left', size: 'xl' });
    (drawer.vm as any).submit();
    expect(drawer.emitted('submit')![0]).toEqual([
      { type: 'openModal', page: 'edit', display: 'drawer', side: 'left', size: 'xl' },
    ]);
  });
});

describe('ActionEdit — openUrl / openFile', () => {
  const mountEdit = (action: unknown) =>
    mount(ActionEdit, {
      props: { action, pages: source.pages, runnables: [], components: [] } as any,
      global: { plugins: [i18n, createPinia()] },
    });

  it('keeps the link, the path and the mode', () => {
    const link = mountEdit({ type: 'openUrl', url: 'https://example.com' });
    (link.vm as any).submit();
    expect(link.emitted('submit')![0]).toEqual([{ type: 'openUrl', url: 'https://example.com' }]);
    const file = mountEdit({ type: 'openFile', path: '{{ runnables.r.outputs.path }}', mode: 'save' });
    (file.vm as any).submit();
    expect(file.emitted('submit')![0]).toEqual([{ type: 'openFile', path: '{{ runnables.r.outputs.path }}', mode: 'save' }]);
  });
});
