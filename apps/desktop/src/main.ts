import { createApp } from 'vue';
import App from './App.vue';
import { detachedWindowPath } from '@/utils/detachedWindows';
import router from './router';
import VueCodemirror from 'vue-codemirror';
import { createPinia } from 'pinia';
import { i18n } from './i18n';
import { installScrollFadeReset } from '@/utils/scrollFadeReset';

import './style.css';

const pinia = createPinia();


createApp(App)
  .use(router)
  .use(pinia)
  .use(VueCodemirror)
  .use(i18n)
  .mount('#app')
  .$nextTick(() => {
    postMessage({ payload: 'removeLoading' }, '*');
  });

installScrollFadeReset();

// A page in its own window (opened by the main process with ?window=<path>) starts on
// that page instead of the dashboard. Waits for the router's own initial navigation,
// which would otherwise land after this one and win.
const windowPath = detachedWindowPath();
if (windowPath) {
  void router.isReady().then(() => router.replace(windowPath));
}
