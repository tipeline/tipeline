import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { IonicVue } from '@ionic/vue';

import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/display.css';
import '@ionic/vue/css/palettes/dark.system.css';
import './theme.css';

import App from './App.vue';
import { router } from './router';
import { i18n } from './i18n';
import { useSession } from './session';

const app = createApp(App).use(IonicVue).use(createPinia()).use(i18n);

// The saved sign-in decides the first screen, so restore it before the router starts.
useSession()
  .restore()
  .finally(() => {
    app.use(router);
    router.isReady().then(() => app.mount('#app'));
  });
