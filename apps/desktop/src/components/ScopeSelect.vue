<script setup lang="ts" generic="T extends string">
import { ListFilter } from 'lucide-vue-next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// A list page's scope (All / Failing / Scheduled / Starred / Recently opened) as one dropdown,
// so the toolbar stays on one row. Each choice shows its count, in the menu and on the button.
defineProps<{
  options: { value: T; label: string; count?: number }[];
  label?: string;
}>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <Select v-model="model">
    <SelectTrigger class="bg-card" :aria-label="label">
      <ListFilter class="size-3.5 opacity-60" />
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
        <span v-if="option.count !== undefined" class="text-xs tabular-nums text-muted-foreground">{{ option.count }}</span>
      </SelectItem>
    </SelectContent>
  </Select>
</template>
