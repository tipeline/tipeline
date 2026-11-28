<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { FileText, FolderOpen, KeyRound, Lock, TriangleAlert } from 'lucide-vue-next';
import Button from '@/components/ui/button/Button.vue';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/sonner';

// Mirrors EnvFileInfo in electron/main/utils/envFile.ts. Names only: values stay in the main process.
interface EnvFileInfo {
  path: string;
  exists: boolean;
  names: string[];
  shared: boolean;
}

const { t } = useI18n();
const info = ref<EnvFileInfo | null>(null);
const isMac = navigator.userAgent.includes('Mac');
const example = '{{ _env.NAME }}';

async function load() {
  try {
    info.value = await window.ipcRenderer.invoke('app:env-file:info');
  } catch {
    info.value = null;
  }
}

async function open(mode: 'open' | 'reveal') {
  const result = await window.ipcRenderer.invoke('app:env-file:open', { mode });
  if (!result?.ok) toast.error(t('settings.environment.openFailed'), { description: result?.detail });
  await load();
}

async function makePrivate() {
  try {
    info.value = await window.ipcRenderer.invoke('app:env-file:private');
    toast.success(t('settings.environment.madePrivate'));
  } catch (err) {
    toast.error(t('settings.environment.privateFailed'), { description: String((err as Error)?.message ?? err) });
  }
}

// The file is edited in another app: show what it holds when the user comes back.
onMounted(() => {
  void load();
  window.addEventListener('focus', load);
});
onBeforeUnmount(() => window.removeEventListener('focus', load));
</script>

<template>
  <section class="space-y-6">
    <div class="space-y-1">
      <div class="text-sm font-medium">{{ t('settings.environment.title') }}</div>
      <p class="text-sm text-muted-foreground">
        {{ t('settings.environment.description', { example }) }}
      </p>
    </div>

    <div class="space-y-3">
      <div class="flex items-center gap-2 text-sm">
        <FileText class="w-4 h-4 text-muted-foreground shrink-0" />
        <span class="font-mono text-xs break-all">{{ info?.path ?? '~/.tipeline/.env' }}</span>
        <Badge v-if="info && !info.exists" variant="secondary">{{ t('settings.environment.notCreated') }}</Badge>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button variant="outline" @click="open('open')">
          <FileText class="w-4 h-4" />
          {{ info?.exists === false ? t('settings.environment.create') : t('settings.environment.open') }}
        </Button>
        <Button variant="outline" @click="open('reveal')">
          <FolderOpen class="w-4 h-4" />
          {{ isMac ? t('settings.environment.revealMac') : t('common.showInFolder') }}
        </Button>
      </div>
      <p class="text-xs text-muted-foreground">{{ t('settings.environment.openHint') }}</p>
    </div>

    <div
      v-if="info?.shared"
      class="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
    >
      <TriangleAlert class="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
      <div class="flex-1 space-y-2">
        <p>{{ t('settings.environment.shared') }}</p>
        <Button size="sm" variant="outline" @click="makePrivate">
          <Lock class="w-4 h-4" />
          {{ t('settings.environment.makePrivate') }}
        </Button>
      </div>
    </div>

    <div v-if="info?.exists" class="space-y-2">
      <div class="text-sm font-medium">{{ t('settings.environment.names') }}</div>
      <p v-if="!info.names.length" class="text-sm text-muted-foreground">
        {{ t('settings.environment.noNames') }}
      </p>
      <div v-else class="flex flex-wrap gap-1.5">
        <Badge v-for="name in info.names" :key="name" variant="outline" class="font-mono">{{ name }}</Badge>
      </div>
    </div>

    <div class="flex items-start gap-3 rounded-md border p-3 text-sm">
      <KeyRound class="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
      <p class="text-muted-foreground">
        {{ t('settings.environment.secretsHint') }}
        <RouterLink :to="{ name: 'Variables' }" class="text-foreground underline underline-offset-2">
          {{ t('settings.environment.secretsLink') }}
        </RouterLink>
      </p>
    </div>
  </section>
</template>
