<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useQuery } from '@/composables/useQuery';
import { useProjectStore } from '@/store/project';
import { SEND } from '@/ipc-channels';
import NotFoundState from '@/components/NotFoundState.vue';
import ProjectMap from '@/components/projectMap/ProjectMap.vue';

/** A project's map as a full page, opened from the project's Map button (like Build for a workflow). */
const route = useRoute();
const { t } = useI18n();
const identifier = route.params.pid as string;

const projectStore = useProjectStore();
const { data: project, isLoading } = useQuery(SEND.PROJECT_DETAIL, { identifier });
const notFound = computed(() => !isLoading.value && !project.value);
watch(project, (p) => p && projectStore.setProject(p), { immediate: true });
</script>

<template>
  <NotFoundState
    v-if="notFound"
    :title="t('projects.notFound.title')"
    :description="t('projects.notFound.description')"
    :back-label="t('projects.notFound.back')"
    :back-to="{ name: 'Projects' }"
  />
  <ProjectMap v-else :project-identifier="identifier" :project-name="project?.name ?? ''" />
</template>
