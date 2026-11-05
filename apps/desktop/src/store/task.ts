import { defineStore } from 'pinia';

export const useTaskStore = defineStore('taskStore', {
  state: () => ({
    currentTask: { name: '', identifier: '' } as { name?: string; identifier?: string }
  }),
  actions: {
    setTask(task:any) {
      this.currentTask = task;
    }
  }
});
