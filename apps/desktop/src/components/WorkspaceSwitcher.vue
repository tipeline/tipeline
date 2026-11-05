<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Server, HardDrive, Check, Loader2 } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { useConnectionStore } from '@/store/connectionStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const store = useConnectionStore();
const router = useRouter();
const { t } = useI18n();

onMounted(() => store.load());

async function switchTo(id: string | null) {
  if (id === store.activeId) return;
  try {
    await store.setActive(id);
  } catch (err: any) {
    const description = err?.message?.includes('AggregateError')
      ? t('workspace.unreachable')
      : (err?.message ?? t('workspace.unreachable'));
    toast.error(t('workspace.switchFailed'), { description });
  }
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger
      class="flex items-center gap-2 w-full px-2 py-2 rounded-md text-sm font-medium hover:bg-foreground/10 transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
      :disabled="store.isSwitching"
      :title="store.getActiveName()"
    >
      <Loader2 v-if="store.isSwitching" class="h-4 w-4 animate-spin shrink-0" />
      <HardDrive v-else-if="!store.activeId" class="h-4 w-4 shrink-0" />
      <Server v-else class="h-4 w-4 shrink-0" />
      <div class="flex flex-col min-w-0 text-left group-data-[collapsible=icon]:hidden">
        <span class="truncate leading-tight">{{ store.getActiveName() }}</span>
        <span v-if="store.serverMe" class="truncate text-xs text-muted-foreground font-normal leading-tight">
          {{ store.serverMe.name }}
        </span>
      </div>
    </DropdownMenuTrigger>

    <DropdownMenuContent align="start" class="w-56">
      <DropdownMenuLabel class="text-xs text-muted-foreground">{{ t('workspace.label') }}</DropdownMenuLabel>
      <DropdownMenuSeparator />

      <DropdownMenuItem class="flex items-center gap-2 cursor-pointer" @click="switchTo(null)">
        <HardDrive class="h-4 w-4 shrink-0" />
        <span class="flex-1">{{ t('workspace.local') }}</span>
        <Check v-if="!store.activeId" class="h-3 w-3 text-muted-foreground" />
      </DropdownMenuItem>

      <DropdownMenuItem
        v-for="conn in store.connections"
        :key="conn.id"
        class="flex items-center gap-2 cursor-pointer"
        @click="switchTo(conn.id)"
      >
        <Server class="h-4 w-4 shrink-0" />
        <div class="flex-1 min-w-0">
          <div class="truncate">{{ conn.name }}</div>
          <div class="text-xs text-muted-foreground truncate">{{ conn.host }}</div>
        </div>
        <Check v-if="store.activeId === conn.id" class="h-3 w-3 text-muted-foreground shrink-0" />
      </DropdownMenuItem>

      <DropdownMenuSeparator />
      <DropdownMenuItem class="cursor-pointer" @click="router.push('/settings/workspaces')">
        {{ t('workspace.manageConnections') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
