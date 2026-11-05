// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { i18n } from '@/i18n';

// The pages themselves aren't under test.
vi.mock('@/components/app/AppPageView.vue', () => ({
  default: defineComponent({
    props: ['pageId', 'host', 'params', 'state', 'source', 'appIdentifier'],
    setup: (p) => () => h('div', { class: 'page', 'data-page': p.pageId }),
  }),
}));

import AppRunner from '@/components/app/AppRunner.vue';

const page = (id: string, name: string, showInMenu = true) => ({
  id,
  name,
  showInMenu,
  runnables: {},
  events: {},
  components: [],
});
const app = (...pages: ReturnType<typeof page>[]) =>
  ({ schemaVersion: 3, workflows: {}, state: {}, pages }) as any;

const mountRunner = (props: Record<string, unknown>) =>
  mount(AppRunner, { props: { appIdentifier: 'a', ...props } as any, global: { plugins: [i18n] } });

describe('AppRunner app row', () => {
  it('elsewhere (run-only window, builder Preview) shows the same tabs, without "App"', () => {
    const w = mountRunner({ source: app(page('main', 'Main'), page('list', 'List')) });
    expect(w.find('[data-testid="app-bar"]').exists()).toBe(false);
    expect(w.findAll('button').map((b) => b.text())).toEqual(['Main', 'List']);
    expect(w.get('[aria-current="page"]').text()).toBe('Main');
    expect(w.text()).not.toContain('App');
  });

  it('elsewhere, a one-page app has no row at all', () => {
    const w = mountRunner({ source: app(page('main', 'Overview')) });
    expect(w.findAll('button')).toHaveLength(0);
    expect(w.text()).not.toContain('Overview');
  });

  it('puts the pages in the row as tabs, with the App label, author and version', async () => {
    const w = mountRunner({
      source: app(page('main', 'Main'), page('list', 'List'), page('edit', 'Edit', false)),
      showAppBar: true,
      author: 'Ana',
      version: '1.4',
    });
    const bar = w.get('[data-testid="app-bar"]');
    expect(bar.findAll('button').map((b) => b.text())).toEqual(['Main', 'List']);
    expect(bar.text()).toContain('App');
    expect(bar.text()).toContain('by Ana · v1.4');
    // No second menu row under the bar.
    expect(w.findAll('button')).toHaveLength(2);

    expect(bar.get('[aria-current="page"]').text()).toBe('Main');

    await bar.findAll('button')[1].trigger('click');
    expect(w.find('[data-page="list"]').exists()).toBe(true);
    expect(bar.get('[aria-current="page"]').text()).toBe('List');
  });

  it('keeps the same row for a one-page app, naming the page as plain text', () => {
    const w = mountRunner({ source: app(page('main', 'Overview')), showAppBar: true });
    const bar = w.get('[data-testid="app-bar"]');
    expect(bar.findAll('button')).toHaveLength(0);
    expect(bar.text()).toContain('Overview');
    expect(bar.text()).not.toContain('by');
  });

  it('leaves out what the app does not set, and does not double the v', () => {
    const versionOnly = mountRunner({ source: app(page('main', 'Main')), showAppBar: true, version: 'v2' });
    expect(versionOnly.get('[data-testid="app-bar"]').text()).toMatch(/App\s*v2$/);

    const authorOnly = mountRunner({ source: app(page('main', 'Main')), showAppBar: true, author: ' Ana ' });
    expect(authorOnly.get('[data-testid="app-bar"]').text()).toMatch(/by Ana$/);
  });

});
