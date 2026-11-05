<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>
<template>
  <div class="flex h-screen flex-row">
    <main class="w-full hidden h-full flex-1 flex-col overflow-hidden md:flex">
      <router-view :key="route.params.tid as string" />
    </main>
  </div>
</template>
