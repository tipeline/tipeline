import { watch } from 'vue';
import { i18n } from '@/i18n';
import { useSession } from '@/session';
import { createDesktopBridge, type DesktopBridge } from './desktopBridge';
import '@/styles/app-area.css';

declare global {
  interface Window {
    ipcRenderer?: DesktopBridge;
  }
}

let prepared: Promise<void> | null = null;

/**
 * Gets the phone ready to run Desktop's app code (once, the first time an app opens):
 *  - Desktop's translations under the phone's own (the phone's wording wins where both
 *    have a key);
 *  - `window.ipcRenderer`, Desktop's bridge to Core, rebuilt on this sign-in's Server
 *    connection and rebuilt again when someone else signs in;
 *  - Desktop's connection store set to "a Server workspace", so app code doesn't offer the
 *    desktop computer's own files;
 *  - Desktop's dark colors following the phone's.
 */
export function prepareApps(): Promise<void> {
  prepared ??= load();
  return prepared;
}

async function load() {
  const [enUi, esUi, enActions, esActions, enMobile, esMobile, desktopI18n, connection] = await Promise.all([
    import('@tipeline/i18n/locales/en/ui.json'),
    import('@tipeline/i18n/locales/es/ui.json'),
    import('@tipeline/i18n/locales/en/actions.json'),
    import('@tipeline/i18n/locales/es/actions.json'),
    import('@tipeline/i18n/locales/en/mobile.json'),
    import('@tipeline/i18n/locales/es/mobile.json'),
    import('@desktop/i18n'),
    import('@desktop/store/connectionStore'),
  ]);
  const global = i18n.global;
  global.mergeLocaleMessage('en', { ...enUi.default, actions: enActions.default });
  global.mergeLocaleMessage('es', { ...esUi.default, actions: esActions.default });
  global.mergeLocaleMessage('en', enMobile.default);
  global.mergeLocaleMessage('es', esMobile.default);
  // Desktop's own instance, for messages its modules build outside components.
  desktopI18n.i18n.global.locale.value = global.locale.value;

  const session = useSession();
  let bridge: ReturnType<typeof createDesktopBridge> | null = null;
  watch(
    () => session.client,
    (client) => {
      bridge?.dispose();
      bridge = client
        ? createDesktopBridge(() => session.api(), {
            openUrl: (url) => window.open(url, '_blank', 'noopener'),
            notify: (message) => void import('vue-sonner').then(({ toast }) => toast.info(message)),
            computerOnly: global.t('appsTab.computerOnly'),
          })
        : null;
      window.ipcRenderer = bridge ?? undefined;
      const desktopConnection = connection.useConnectionStore();
      desktopConnection.activeId = client ? 'server' : null;
      desktopConnection.serverMe = session.user
        ? { id: session.user.id, email: session.user.email, name: session.user.name, role: session.user.role }
        : null;
    },
    { immediate: true }
  );

  const dark = window.matchMedia?.('(prefers-color-scheme: dark)');
  const applyDark = () => document.documentElement.classList.toggle('dark', !!dark?.matches);
  applyDark();
  dark?.addEventListener?.('change', applyDark);
}

/** While an app is on screen: Desktop's reset applies (see styles/app-preflight.css). */
export function setAppsOpen(open: boolean) {
  document.body.classList.toggle('tl-apps', open);
}
