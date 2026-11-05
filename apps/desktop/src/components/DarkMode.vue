<script setup lang="ts">
import { useColorMode } from '@vueuse/core';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-vue-next';

const mode = useColorMode();

const toggleTheme = () => {
  mode.value = mode.value === 'dark' ? 'light' : 'dark';
};
</script>

<template>
  <Button variant="outline" @click="toggleTheme">
    <Moon
      class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 dark:-rotate-90 dark:scale-0"
    />
    <Sun
      class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0  dark:rotate-0 dark:scale-100"
    />
    <span class="sr-only">Toggle theme</span>
  </Button>
</template>