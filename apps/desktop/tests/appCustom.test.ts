// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true,"disableJavaScriptFileLoading":true}}
import { describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { coreValidations, type AppSource } from '@tipeline/schemas';
import { i18n } from '@/i18n';
import CustomWidget from '@/components/app/widgets/CustomWidget.vue';
import { customDocument, customMessage } from '@/utils/appCustom';
import { analyzeApp } from '@/utils/appProblems';
import { useBuilderStore } from '@/store/builderStore';

const THEME = { mode: 'light' as const, colors: { primary: 'oklch(0.2 0 0)', foreground: '#111' } };
const CODE = '<div id="out">{{ not a binding }}</div><script>tipeline.onData((d) => (out.textContent = d.n));</script>';

describe('customDocument', () => {
  it('puts the bridge and the theme first, then the code as written', () => {
    const doc = customDocument(CODE, { n: 1 }, THEME);
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc.indexOf('window.tipeline')).toBeLessThan(doc.indexOf(CODE));
    expect(doc).toContain('--tl-primary: oklch(0.2 0 0);');
    expect(doc).toContain('let data = {"n":1};');
    expect(doc).toContain(CODE);
  });

  it('data can’t close the bridge’s script; a whole document keeps its doctype', () => {
    const doc = customDocument('<p>x</p>', { html: '</script><script>alert(1)</script>' }, THEME);
    expect(doc).not.toContain('</script><script>alert(1)');
    expect(doc).toContain('\\u003c/script>');
    const whole = customDocument('<!doctype html><html><head><title>t</title></head><body>b</body></html>', null, THEME);
    expect(whole.startsWith('<!doctype html><html><head><meta charset="utf-8">')).toBe(true);
    expect(whole.match(/<!doctype/gi)).toHaveLength(1);
  });

  it('theme values that could break out of the style are dropped', () => {
    const doc = customDocument('<p></p>', null, { mode: 'dark', colors: { primary: 'red; } body { display:none', fine: '#000' } });
    expect(doc).not.toContain('display:none');
    expect(doc).toContain('color-scheme: dark');
  });
});

describe('customMessage', () => {
  it('only the bridge’s messages: events with a name, values; plain JSON', () => {
    expect(customMessage({ __tipeline: true, kind: 'event', name: 'pick', payload: { id: 3 } })).toEqual({ kind: 'event', name: 'pick', payload: { id: 3 } });
    expect(customMessage({ __tipeline: true, kind: 'value', value: [1, 2] })).toEqual({ kind: 'value', value: [1, 2] });
    for (const bad of [{ kind: 'event', name: 'x' }, { __tipeline: true, kind: 'event', name: 'bad name' }, { __tipeline: true, kind: 'other' }, 'hi'])
      expect(customMessage(bad)).toBeNull();
  });
});

describe('CustomWidget', () => {
  const mountCustom = (props: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    mount(CustomWidget, { props: { props, componentId: 'picker', ...extra }, global: { plugins: [i18n] }, attachTo: document.body });
  const post = (w: ReturnType<typeof mount>, data: unknown) => {
    const source = (w.get('iframe').element as HTMLIFrameElement).contentWindow;
    window.dispatchEvent(new MessageEvent('message', { data, source: source as any }));
  };

  it('runs sandboxed, never with the app’s origin', () => {
    const w = mountCustom({ code: CODE });
    expect(w.get('iframe').attributes('sandbox')).not.toContain('allow-same-origin');
    expect(w.get('iframe').attributes('srcdoc')).toContain(CODE);
    w.unmount();
  });

  it('new data doesn’t reload the page; new code does', async () => {
    const w = mountCustom({ code: CODE, data: { n: 1 } });
    const first = w.get('iframe').attributes('srcdoc');
    await w.setProps({ props: { code: CODE, data: { n: 2 } } });
    expect(w.get('iframe').attributes('srcdoc')).toBe(first);
    await w.setProps({ props: { code: CODE + '<p>more</p>', data: { n: 2 } } });
    expect(w.get('iframe').attributes('srcdoc')).toContain('let data = {"n":2};');
    w.unmount();
  });

  it('declared events fire event:<name> with lastEvent; others are ignored; setValue sets value', async () => {
    const w = mountCustom({ code: CODE, eventNames: ['pick'] });
    post(w, { __tipeline: true, kind: 'event', name: 'pick', payload: { id: 7 } });
    post(w, { __tipeline: true, kind: 'event', name: 'undeclared', payload: 1 });
    post(w, { __tipeline: true, kind: 'value', value: 'blue' });
    await nextTick();
    expect(w.emitted('event')).toEqual([['event:pick', { lastEvent: { name: 'pick', payload: { id: 7 } } }]]);
    expect(w.emitted('state')).toEqual([[{ lastEvent: { name: 'pick', payload: { id: 7 } } }], [{ value: 'blue' }]]);
    w.unmount();
  });

  it('messages from other windows don’t count; nothing fires in the builder', async () => {
    const w = mountCustom({ code: CODE, eventNames: ['pick'] });
    window.dispatchEvent(new MessageEvent('message', { data: { __tipeline: true, kind: 'event', name: 'pick' }, source: window }));
    expect(w.emitted('event')).toBeUndefined();
    w.unmount();
    const b = mountCustom({ code: CODE, eventNames: ['pick'] }, { editable: true });
    post(b, { __tipeline: true, kind: 'event', name: 'pick' });
    expect(b.emitted('event')).toBeUndefined();
    expect(b.get('iframe').classes()).toContain('pointer-events-none');
    b.unmount();
  });
});

// ---- the code is kept as written: runtime, problems, renames
const page = (code: string): AppSource =>
  ({
    schemaVersion: 4,
    workflows: {},
    state: {},
    pages: [
      {
        id: 'p',
        name: 'P',
        showInMenu: true,
        events: {},
        runnables: {},
        components: [
          { id: 'title', type: 'text', name: 'T', layout: { x: 0, y: 0, w: 6, h: 4 }, props: { content: 'Hi' }, events: {} },
          {
            id: 'widget',
            type: 'custom',
            name: 'W',
            layout: { x: 0, y: 4, w: 6, h: 10 },
            props: { code, data: '{= title.value =}', eventNames: ['pick'] },
            events: { 'event:pick': [{ type: 'toast', message: 'Picked {{ widget.lastEvent.payload }}' }] },
          },
        ],
      },
    ],
  }) as any;

describe('a custom component’s code is never read for bindings', () => {
  const code = '<p>{{ title.content }} {{ nothing.here }}</p>';

  it('problems: no "unknown reference" for code; the schema checks its events', () => {
    const problems = analyzeApp(page(code), new Map());
    expect(problems.filter((p) => JSON.stringify(p).includes('nothing'))).toEqual([]);
    const source = page(code) as any;
    source.pages[0].components[1].events = { 'event:other': [] };
    const result = coreValidations.appObject.appSourceSchema.safeParse(source);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('isn\'t in this component\'s eventNames');
  });

  it('renaming a component or copying one leaves the code alone', () => {
    setActivePinia(createPinia());
    const store = useBuilderStore();
    store.source = page(code) as any;
    store.selectedPageId = 'p';
    store.renameComponent('title', 'heading');
    const widget = () => (store.source as any).pages[0].components.find((c: any) => c.type === 'custom');
    expect(widget().props.code).toBe(code);
    expect(widget().props.data).toBe('{= heading.value =}');
    store.duplicateComponent('widget');
    const copy = (store.source as any).pages[0].components.at(-1);
    expect(copy.props.code).toBe(code);
    expect(copy.events['event:pick'][0].message).toBe('Picked {{ widgetCopy.lastEvent.payload }}');
  });
});
