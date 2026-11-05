<script setup lang="ts">
import type { Component } from 'vue';
import { SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

defineProps<{
  item: { title: string; url: string; icon: Component; badge?: number; external?: boolean };
}>();
</script>

<template>
  <SidebarMenuItem class="text-heading font-semibold">
    <SidebarMenuButton asChild class="text-sm font-medium" :tooltip="item.title">
      <a v-if="item.external" :href="item.url" class="flex items-center gap-4" target="_blank">
        <component :is="item.icon" />
        <span>{{ item.title }}</span>
      </a>
      <router-link v-else :to="item.url" class="flex items-center gap-4">
        <component :is="item.icon" />
        <span>{{ item.title }}</span>
      </router-link>
    </SidebarMenuButton>
    <SidebarMenuBadge v-if="item.badge" class="bg-destructive text-destructive-foreground">
      {{ item.badge }}
    </SidebarMenuBadge>
  </SidebarMenuItem>
</template>
