import { embedMessage } from './appEmbed';

// A custom component's page: its own code, with a small `tipeline` bridge put in first.
//
//   tipeline.data            the `data` prop (any value), as it is now
//   tipeline.onData(fn)      fn(data) now and on every change; returns a function to stop
//   tipeline.emit(name, x)   fires the component's `event:<name>` (lastEvent = { name, payload: x })
//   tipeline.setValue(v)     sets `<id>.value`, like an input's
//   tipeline.theme           'light' or 'dark' (a 'tipeline:theme' event fires when it changes)
//
// The page also gets the app's colors as CSS variables (--tl-background, --tl-foreground,
// --tl-muted, --tl-muted-foreground, --tl-border, --tl-primary, --tl-primary-foreground,
// --tl-accent) and a plain base style, so it looks like the rest of the app. It runs
// sandboxed like an Embed's HTML: no access to the app beyond these messages.

export type CustomTheme = { mode: 'light' | 'dark'; colors: Record<string, string> };

// Inside <script>: no "</script>" (or "<!--") can end it early.
const scriptSafe = (json: string) =>
  json.replace(/</g, '\\u003c').replace(new RegExp('\\u2028', 'g'), '\\u2028').replace(new RegExp('\\u2029', 'g'), '\\u2029');

export function customDocument(code: string, data: unknown, theme: CustomTheme): string {
  let json: string;
  try {
    json = JSON.stringify(data ?? null) ?? 'null';
  } catch {
    json = 'null';
  }
  const vars = Object.entries(theme.colors)
    .filter(([name, value]) => /^[a-z-]+$/.test(name) && !/[;{}<>]/.test(value))
    .map(([name, value]) => `--tl-${name}: ${value};`)
    .join(' ');
  const head = `<meta charset="utf-8"><style>
:root { color-scheme: ${theme.mode}; ${vars} }
html, body { margin: 0; background: transparent; color: var(--tl-foreground, inherit);
  font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
</style><script>
(() => {
  let data = ${scriptSafe(json)};
  let theme = ${JSON.stringify(theme.mode)};
  const listeners = new Set();
  const send = (message) => parent.postMessage(Object.assign({ __tipeline: true }, message), '*');
  window.tipeline = Object.freeze({
    get data() { return data; },
    get theme() { return theme; },
    onData(fn) {
      listeners.add(fn);
      try { fn(data); } catch (error) { console.error(error); }
      return () => listeners.delete(fn);
    },
    emit(name, payload) { send({ kind: 'event', name: String(name), payload }); },
    setValue(value) { send({ kind: 'value', value }); },
  });
  addEventListener('message', (e) => {
    if (e.source !== parent || !e.data || e.data.__tipeline !== true) return;
    if (e.data.kind === 'theme') {
      // The app switched light / dark: new colors, without reloading the page.
      theme = e.data.mode === 'dark' ? 'dark' : 'light';
      const root = document.documentElement.style;
      root.colorScheme = theme;
      for (const [name, value] of Object.entries(e.data.colors || {})) {
        if (/^[a-z-]+$/.test(name)) root.setProperty('--tl-' + name, String(value));
      }
      dispatchEvent(new CustomEvent('tipeline:theme', { detail: theme }));
      return;
    }
    if (e.data.kind !== 'data') return;
    data = e.data.data;
    listeners.forEach((fn) => { try { fn(data); } catch (error) { console.error(error); } });
  });
})();
</script>`;
  // A whole document keeps its own <!doctype>: the bridge goes inside its <head>.
  if (/<head[^>]*>/i.test(code)) return code.replace(/<head[^>]*>/i, (tag) => tag + head);
  if (/<html[^>]*>/i.test(code)) return code.replace(/<html[^>]*>/i, (tag) => `${tag}<head>${head}</head>`);
  return `<!doctype html><html><head>${head}</head><body>${code}</body></html>`;
}

export type CustomMessage = { kind: 'event'; name: string; payload: unknown } | { kind: 'value'; value: unknown };

/** A message the bridge sent (plain JSON only, as an Embed's), or null. */
export function customMessage(raw: unknown): CustomMessage | null {
  const data = embedMessage(raw);
  if (!data || typeof data !== 'object' || (data as any).__tipeline !== true) return null;
  const m = data as Record<string, unknown>;
  if (m.kind === 'event' && typeof m.name === 'string' && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(m.name))
    return { kind: 'event', name: m.name, payload: m.payload ?? null };
  if (m.kind === 'value') return { kind: 'value', value: m.value ?? null };
  return null;
}

/** The app's colors, read from its CSS variables (for the custom page's --tl-*). */
export function appThemeColors(root: HTMLElement = document.documentElement): Record<string, string> {
  const style = getComputedStyle(root);
  const names = ['background', 'foreground', 'muted', 'muted-foreground', 'border', 'primary', 'primary-foreground', 'accent', 'destructive', 'card'];
  return Object.fromEntries(names.map((n) => [n, style.getPropertyValue(`--${n}`).trim()]).filter(([, v]) => v));
}
