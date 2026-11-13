<script setup lang="ts">
import AssistantPanel from '@/components/agent/AssistantPanel.vue';
</script>
<template>
  <div class="flex h-screen flex-row overflow-hidden">
    <!-- The builders' side panels are position: fixed. contain: layout makes this area their frame,
         so they stop at the Assistant's edge instead of the window's. -->
    <main class="w-full hidden h-full min-w-0 flex-1 flex-col overflow-hidden [contain:layout] md:flex">
      <router-view />
    </main>
    <AssistantPanel />
  </div>
</template>
