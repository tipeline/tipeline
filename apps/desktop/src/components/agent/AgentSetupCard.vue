<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { KeyRoundIcon } from 'lucide-vue-next';
import { PROVIDERS, PROVIDER_LABELS, type ProviderName } from '@tipeline/agent/provider-names';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAgentStore } from '@/store/agentStore';
import { useSettingsStore } from '@/store/settingsStore';

// A request was sent before any AI provider was set up. Rather than fail it, ask for a key
// here and send the request as soon as it's saved. Base URL, model and MCP stay in Settings.
const { t } = useI18n();
const router = useRouter();
const agentStore = useAgentStore();
const settingsStore = useSettingsStore();

const provider = ref<ProviderName>((settingsStore.get('agent_provider', 'deepseek') as ProviderName) || 'deepseek');
const apiKey = ref('');
const saving = ref(false);

const keyLabel = computed(() => t(`settings.agent.${provider.value}ApiKey`));
const keyHint = computed(() => t(`settings.agent.${provider.value}ApiKeyHint`));

async function connect() {
  if (!apiKey.value.trim() || saving.value) return;
  saving.value = true;
  try {
    await agentStore.connectProvider(provider.value, apiKey.value);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <form class="rounded-lg border bg-card p-4 space-y-4" @submit.prevent="connect">
    <div class="flex items-start gap-3">
      <span class="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0">
        <KeyRoundIcon class="w-4 h-4 text-muted-foreground" />
      </span>
      <div class="min-w-0">
        <p class="text-sm font-medium m-0">{{ t('agent.setup.title') }}</p>
        <p class="text-xs text-muted-foreground mt-1 m-0">{{ t('agent.setup.description') }}</p>
      </div>
    </div>

    <div class="space-y-1">
      <p class="text-xs font-medium text-muted-foreground m-0">{{ t('agent.setup.yourRequest') }}</p>
      <p class="rounded-md bg-muted px-3 py-2 text-sm whitespace-pre-line m-0">{{ agentStore.pendingPrompt }}</p>
    </div>

    <div class="space-y-1.5">
      <label for="agent-setup-provider" class="text-sm font-medium">{{ t('settings.agent.provider') }}</label>
      <Select v-model="provider">
        <SelectTrigger id="agent-setup-provider" class="w-full text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="p in PROVIDERS" :key="p" :value="p">{{ PROVIDER_LABELS[p] }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="space-y-1.5">
      <label for="agent-setup-key" class="text-sm font-medium">{{ keyLabel }}</label>
      <Input id="agent-setup-key" v-model="apiKey" type="password" autocomplete="off" />
      <p class="text-xs text-muted-foreground m-0">{{ keyHint }}</p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" :disabled="!apiKey.trim() || saving">{{ t('agent.setup.connect') }}</Button>
      <Button type="button" size="sm" variant="ghost" @click="agentStore.pendingPrompt = ''">
        {{ t('common.cancel') }}
      </Button>
      <Button type="button" size="sm" variant="link" class="ml-auto px-0" @click="router.push('/settings/agent')">
        {{ t('agent.setup.moreOptions') }}
      </Button>
    </div>
  </form>
</template>
