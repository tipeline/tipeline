<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { SidebarTrigger } from '@/components/ui/sidebar';
import Breadcrumb from '@/components/Breadcrumb.vue';
import NavButtons from '@/components/NavButtons.vue';
import SearchModal from '@/components/SearchModal.vue';
import { SearchIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import AssistantButton from '@/components/agent/AssistantButton.vue';
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts';

const searchOpen = ref(false);
const { t } = useI18n();

useKeyboardShortcuts([{ key: 'j', meta: true, handler: () => { searchOpen.value = true; } }]);
</script>

<template>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-4">
      <SidebarTrigger />
      <NavButtons />
      <Breadcrumb />
    </div>
    <div class="flex items-center gap-4">
      <Button variant="outline" @click="searchOpen = true">
        <SearchIcon class="w-4 h-4 mr-2" /> {{ t('search.button') }}
        <span class="text-sm text-muted-foreground ml-2">
          <kbd
            class="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100"
          >
            <span class="text-xs">⌘</span>J
          </kbd>
        </span>
      </Button>

      <AssistantButton />
    </div>
  </div>

  <SearchModal v-model:open="searchOpen" />
</template>
