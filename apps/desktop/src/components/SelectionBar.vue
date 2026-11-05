<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Trash } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';

// "N selected · Clear · Delete" for a list with ticked rows (DataTable `selectable`).
defineProps<{ count: number }>();
const emit = defineEmits<{ clear: []; delete: [] }>();

const { t } = useI18n();
</script>

<template>
  <div class="ml-auto flex items-center gap-2">
    <span class="text-sm text-muted-foreground whitespace-nowrap">
      {{ t('dataTable.selected', count) }}
    </span>
    <Button variant="ghost" size="sm" @click="emit('clear')">
      {{ t('dataTable.clearSelection') }}
    </Button>
    <Button variant="destructive" size="sm" @click="emit('delete')">
      <Trash class="w-4 h-4" /> {{ t('common.delete') }}
    </Button>
  </div>
</template>
