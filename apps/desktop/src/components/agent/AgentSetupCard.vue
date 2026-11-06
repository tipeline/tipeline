<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { KeyRoundIcon, SettingsIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';

// No AI provider is set up yet. Tipeline comes with none, so say so and send the user to
// Settings, where each provider has all its fields (key, base URL, model).
defineProps<{ requestKept?: boolean }>();

const { t } = useI18n();
const router = useRouter();
</script>

<template>
  <div class="rounded-lg border bg-card p-4 space-y-4">
    <div class="flex items-start gap-3">
      <span class="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
        <KeyRoundIcon class="w-4 h-4 text-muted-foreground" />
      </span>
      <div class="min-w-0">
        <p class="text-sm font-medium m-0">{{ t('agent.setup.title') }}</p>
        <p class="text-xs text-muted-foreground mt-1 m-0">{{ t('agent.setup.description') }}</p>
        <p v-if="requestKept" class="text-xs text-muted-foreground mt-1 m-0">{{ t('agent.setup.requestKept') }}</p>
      </div>
    </div>

    <Button size="sm" @click="router.push('/settings/agent')">
      <SettingsIcon class="w-3.5 h-3.5 mr-1" /> {{ t('agent.setup.openSettings') }}
    </Button>
  </div>
</template>
