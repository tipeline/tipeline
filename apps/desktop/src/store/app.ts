import { defineStore } from 'pinia';

export const useAppStore = defineStore('appStore', {
  state: () => ({
    currentApp: { name: '' },
  }),
  actions: {
    setApp(app: any) {
      this.currentApp = app;
    },
  },
});
