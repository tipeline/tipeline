import { defineStore } from 'pinia';

export const useProjectStore = defineStore('projectStore', {
  state: () => ({
    currentProject: { name: '' },
  }),
  actions: {
    setProject(project: any) {
      this.currentProject = project;
    },
  },
});
