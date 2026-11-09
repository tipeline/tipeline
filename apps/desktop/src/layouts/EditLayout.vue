<script setup lang="ts">
import { useRoute } from 'vue-router';
import AssistantPanel from '@/components/agent/AssistantPanel.vue';

const route = useRoute();
</script>
<template>
  <div class="flex h-screen flex-row">
    <!-- The builders' side panels are position: fixed. contain: layout makes this area their frame,
         so they stop at the Assistant's edge instead of the window's. -->
    <main class="w-full hidden h-full min-w-0 flex-1 flex-col overflow-hidden [contain:layout] md:flex">
      <router-view :key="route.params.tid as string" />
    </main>
    <AssistantPanel />
  </div>
</template>
