// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true,"disableJavaScriptFileLoading":true}}
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { coreValidations } from '@tipeline/schemas';
import { i18n } from '@/i18n';
import EmbedWidget from '@/components/app/widgets/EmbedWidget.vue';
import { APP_RUNTIME } from '@/components/app/appRuntimeKey';
import { embedMessage, embedSandbox, embedSource } from '@/utils/appEmbed';

describe('embedSource', () => {
  it('html wins; web pages; files; nothing', () => {
    expect(embedSource('https://x.org', '<b>hi</b>')).toEqual({ kind: 'html', html: '<b>hi</b>' });
    expect(embedSource(' https://example.org/a ', '  ')).toEqual({ kind: 'url', url: 'https://example.org/a' });
    expect(embedSource('reports/today.html', undefined)).toEqual({ kind: 'file', path: 'reports/today.html' });
    expect(embedSource('C:\\Users\\a\\r.html', undefined)).toEqual({ kind: 'file', path: 'C:\\Users\\a\\r.html' });
    expect(embedSource('', undefined)).toEqual({ kind: 'none' });
  });

  it('refuses other schemes and the app itself', () => {
    for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'tipeline-asset://x.html', 'data:text/html,<b>x</b>'])
      expect(embedSource(bad, undefined)).toEqual({ kind: 'invalid', reason: 'badUrl' });
    expect(embedSource('http://127.0.0.1:3344/#/apps', undefined, 'http://127.0.0.1:3344')).toEqual({ kind: 'invalid', reason: 'ownOrigin' });
    expect(embedSource('http://127.0.0.1:3000/', undefined, 'http://127.0.0.1:3344').kind).toBe('url');
  });
});

describe('embedSandbox', () => {
  it('never same-origin for HTML or files; never top navigation', () => {
    for (const kind of ['html', 'file'] as const) expect(embedSandbox(kind)).not.toContain('allow-same-origin');
    expect(embedSandbox('url')).toContain('allow-same-origin');
    for (const kind of ['html', 'file', 'url'] as const) expect(embedSandbox(kind)).not.toContain('top-navigation');
    expect(embedSandbox('html', false)).not.toContain('allow-scripts');
    expect(embedSandbox('html')).toContain('allow-scripts');
  });
});

describe('embedMessage', () => {
  it('keeps plain data only, and not too much of it', () => {
    expect(embedMessage({ picked: [1, 2], ok: true })).toEqual({ picked: [1, 2], ok: true });
    expect(embedMessage(() => 1)).toBeUndefined();
    expect(embedMessage('x'.repeat(300 * 1024))).toBeUndefined();
  });
});

describe('EmbedWidget', () => {
  afterEach(() => {
    delete (window as any).ipcRenderer;
  });
  const mountEmbed = (props: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    mount(EmbedWidget, {
      props: { props, componentId: 'report', ...extra },
      global: { plugins: [i18n], provide: { [APP_RUNTIME as symbol]: { appIdentifier: () => 'app-1' } } },
      attachTo: document.body,
    });

  it('HTML runs in a frame of its own origin, never the app’s', () => {
    const w = mountEmbed({ html: '<h1>Report</h1>' });
    const frame = w.get('iframe');
    expect(frame.attributes('srcdoc')).toBe('<h1>Report</h1>');
    expect(frame.attributes('sandbox')).not.toContain('allow-same-origin');
    expect(frame.attributes('src')).toBeUndefined();
    w.unmount();
  });

  it('a web page has Open in browser; the app’s own address is refused', () => {
    const page = mountEmbed({ src: 'https://example.org/docs', title: 'Docs' });
    expect(page.get('iframe').attributes('src')).toBe('https://example.org/docs');
    expect(page.get('[data-testid="embed-host"]').text()).toBe('example.org');
    expect(page.find('[data-testid="embed-open"]').exists()).toBe(true);
    page.unmount();
    const own = mountEmbed({ src: `${window.location.origin}/#/apps` });
    expect(own.find('iframe').exists()).toBe(false);
    expect(own.get('[data-testid="embed-error"]').text()).toContain('Tipeline itself');
    own.unmount();
  });

  it('an HTML file is read through the main process (file rules), and again after a run', async () => {
    const invoke = vi.fn(async () => ({ ok: true, bytes: new TextEncoder().encode('<p>v1</p>') }));
    (window as any).ipcRenderer = { invoke };
    const w = mountEmbed({ src: 'reports/today.html' });
    await vi.waitFor(() => expect(w.find('iframe').exists()).toBe(true));
    expect(invoke).toHaveBeenCalledWith('app:read-file', { path: 'reports/today.html', appIdentifier: 'app-1' });
    expect(w.get('iframe').attributes('srcdoc')).toBe('<p>v1</p>');
    expect(w.get('iframe').attributes('sandbox')).not.toContain('allow-same-origin');

    invoke.mockResolvedValueOnce({ ok: true, bytes: new TextEncoder().encode('<p>v2</p>') });
    await w.setProps({ busy: true });
    await w.setProps({ busy: false });
    await vi.waitFor(() => expect(w.get('iframe').attributes('srcdoc')).toBe('<p>v2</p>'));
    w.unmount();
  });

  it('a file outside ~/Tipeline says how to allow it', async () => {
    (window as any).ipcRenderer = { invoke: vi.fn(async () => ({ ok: false, error: 'outsideTipeline' })) };
    const w = mountEmbed({ src: '/etc/report.html' });
    await vi.waitFor(() => expect(w.find('[data-testid="embed-error"]').exists()).toBe(true));
    expect(w.get('[data-testid="embed-error"]').text()).toContain('File access');
    w.unmount();
  });

  it('a message from its own frame becomes state + event; others are ignored', async () => {
    const w = mountEmbed({ html: '<p>x</p>' });
    const frameWindow = (w.get('iframe').element as HTMLIFrameElement).contentWindow;
    window.dispatchEvent(new MessageEvent('message', { data: { picked: 3 }, source: window }));
    expect(w.emitted('event')).toBeUndefined();
    window.dispatchEvent(new MessageEvent('message', { data: { picked: 3 }, source: frameWindow as any }));
    await nextTick();
    expect(w.emitted('state')).toEqual([[{ message: { picked: 3 } }]]);
    expect(w.emitted('event')).toEqual([['message', { message: { picked: 3 } }]]);
    w.unmount();
  });

  it('in the builder, a bound source is named, and the frame takes no clicks', () => {
    const bound = mountEmbed({ html: '{{ runnables.r.outputs.html }}' }, { editable: true });
    expect(bound.find('iframe').exists()).toBe(false);
    expect(bound.text()).toContain('runnables.r.outputs.html');
    bound.unmount();
    const plain = mountEmbed({ html: '<p>x</p>' }, { editable: true });
    expect(plain.get('iframe').classes()).toContain('pointer-events-none');
    plain.unmount();
  });
});

describe('builder event labels', () => {
  it('every component event has a label in English and Spanish', () => {
    const events = new Set(Object.values(coreValidations.appObject.APP_COMPONENT_EVENTS).flat());
    for (const name of events)
      for (const locale of ['en', 'es']) expect(i18n.global.te(`builder.eventNames.${name}`, locale), `${locale}: ${name}`).toBe(true);
  });
});
