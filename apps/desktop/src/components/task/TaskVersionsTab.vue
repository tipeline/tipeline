<script setup lang="ts">
import VersionsView from '@/components/versions/VersionsView.vue';

defineProps<{ task: any }>();
// The workflow changed (a version was put back): the page reloads it.
defineEmits<{ updated: [] }>();
</script>

<template>
  <VersionsView kind="task" :item="task" @updated="$emit('updated')" />
</template>
