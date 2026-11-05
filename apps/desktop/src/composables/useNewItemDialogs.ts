import { ref } from 'vue';

// The New Workflow and New App dialogs are mounted once for the whole window (App.vue),
// so the Dashboard, the lists and the old /tasks/new and /apps/new links all open the
// same dialog on top of whatever page you are on.
export const newTaskDialogOpen = ref(false);
export const newAppDialogOpen = ref(false);
// The project the new item starts in — set when the dialog is opened from a project.
export const newItemProject = ref<string | null>(null);

export function openNewTaskDialog(projectIdentifier?: string) {
  newItemProject.value = projectIdentifier ?? null;
  newTaskDialogOpen.value = true;
}

export function openNewAppDialog(projectIdentifier?: string) {
  newItemProject.value = projectIdentifier ?? null;
  newAppDialogOpen.value = true;
}
