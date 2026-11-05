<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-vue-next';
import { descriptionSummary } from '@tipeline/utils';

const { t } = useI18n();

type PickerItem = {
  identifier: string;
  name: string;
  description?: string | null;
};

const props = defineProps<{
  items: PickerItem[];
  assigning?: string | null;
}>();

const emit = defineEmits<{
  pick: [identifier: string];
}>();

const search = ref('');

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return props.items;
  return props.items.filter(
    (i) => i.name.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q)
  );
});
</script>

<template>
  <div class="space-y-3">
    <div class="relative">
      <Search class="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
      <Input v-model="search" :placeholder="t('common.searchPlaceholder')" class="pl-8" />
    </div>

    <div class="max-h-72 overflow-y-auto space-y-1">
      <p v-if="!filtered.length" class="text-sm text-muted-foreground text-center py-6">
        {{ t('common.noItemsAvailable') }}
      </p>
      <button
        v-for="item in filtered"
        :key="item.identifier"
        type="button"
        class="w-full text-left rounded-md px-3 py-2 hover:bg-accent transition-colors flex items-center justify-between gap-2 disabled:opacity-50"
        :disabled="assigning === item.identifier"
        @click="emit('pick', item.identifier)"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium truncate">{{ item.name }}</p>
          <p v-if="item.description" class="text-xs text-muted-foreground truncate">
            {{ descriptionSummary(item.description) }}
          </p>
        </div>
        <span v-if="assigning === item.identifier" class="text-xs text-muted-foreground shrink-0">
          {{ t('common.addingEllipsis') }}
        </span>
      </button>
    </div>
  </div>
</template>
