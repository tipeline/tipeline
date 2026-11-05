<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettingsStore } from '@/store/settingsStore';
import { PROVIDERS, PROVIDER_LABELS, type ProviderName } from '@tipeline/agent/provider-names';
import { INSTRUCTIONS_SETTING } from '@tipeline/agent/instructions';
import InstructionsTextarea from '@/components/agent/InstructionsTextarea.vue';

const store = useSettingsStore();
const { t } = useI18n();

const DEFAULT_MCP_URL = 'http://127.0.0.1:4002/mcp';

const provider = ref<ProviderName>('deepseek');
const anthropicApiKey = ref('');
const anthropicModel = ref('');
const deepseekApiKey = ref('');
const geminiApiKey = ref('');
const openaiApiKey = ref('');
const openaiBaseUrl = ref('');
const openaiModel = ref('');
const mcpToken = ref('');
const mcpUrl = ref('');
const instructions = ref('');

watch(
  () => store.settings,
  () => {
    provider.value = (store.get('agent_provider', 'deepseek') as ProviderName) || 'deepseek';
    anthropicApiKey.value = store.get('agent_anthropic_api_key');
    anthropicModel.value = store.get('agent_anthropic_model');
    deepseekApiKey.value = store.get('agent_deepseek_api_key');
    geminiApiKey.value = store.get('agent_gemini_api_key');
    openaiApiKey.value = store.get('agent_openai_api_key');
    openaiBaseUrl.value = store.get('agent_openai_base_url');
    openaiModel.value = store.get('agent_openai_model');
    mcpToken.value = store.get('agent_mcp_token');
    mcpUrl.value = store.get('agent_mcp_url', DEFAULT_MCP_URL);
    instructions.value = store.get(INSTRUCTIONS_SETTING);
  },
  { immediate: true, deep: true }
);

function saveAgentSetting(key: string, value: string) {
  store.set(key, value || (key === 'agent_mcp_url' ? DEFAULT_MCP_URL : ''));
}

function saveInstructions() {
  const text = instructions.value.trim();
  if (text !== (store.get(INSTRUCTIONS_SETTING) ?? '')) store.set(INSTRUCTIONS_SETTING, text);
}

function saveProvider(value: ProviderName) {
  provider.value = value;
  store.set('agent_provider', value);
}

onMounted(async () => {
  await store.load();
  // Nothing to paste in manually for the common case (Core running locally): the MCP
  // server auths with Core's own API token, so default the field to that unless the
  // user has already set something else (e.g. a token for a remote Core).
  if (!store.get('agent_mcp_token')) {
    const token = await store.getApiToken().catch(() => '');
    if (token) await store.set('agent_mcp_token', token);
  }
});
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <div class="text-sm font-medium">{{ t('settings.agent.provider') }}</div>
        <div class="text-xs text-muted-foreground mt-0.5">{{ t('settings.agent.providerHint') }}</div>
      </div>
      <Select :model-value="provider" @update:model-value="saveProvider($event as ProviderName)">
        <SelectTrigger class="w-40 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="p in PROVIDERS" :key="p" :value="p">{{ PROVIDER_LABELS[p] }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <template v-if="provider === 'anthropic'">
      <div class="space-y-1.5">
        <div class="text-sm font-medium">{{ t('settings.agent.anthropicApiKey') }}</div>
        <Input
          v-model="anthropicApiKey"
          type="password"
          autocomplete="off"
          class="max-w-sm"
          @blur="saveAgentSetting('agent_anthropic_api_key', anthropicApiKey)"
        />
        <p class="text-xs text-muted-foreground">{{ t('settings.agent.anthropicApiKeyHint') }}</p>
      </div>

      <div class="space-y-1.5">
        <div class="text-sm font-medium">{{ t('settings.agent.anthropicModel') }}</div>
        <Input
          v-model="anthropicModel"
          placeholder="claude-opus-5-5"
          class="max-w-sm"
          @blur="saveAgentSetting('agent_anthropic_model', anthropicModel)"
        />
        <p class="text-xs text-muted-foreground">{{ t('settings.agent.anthropicModelHint') }}</p>
      </div>
    </template>

    <div v-else-if="provider === 'deepseek'" class="space-y-1.5">
      <div class="text-sm font-medium">{{ t('settings.agent.deepseekApiKey') }}</div>
      <Input
        v-model="deepseekApiKey"
        type="password"
        autocomplete="off"
        class="max-w-sm"
        @blur="saveAgentSetting('agent_deepseek_api_key', deepseekApiKey)"
      />
      <p class="text-xs text-muted-foreground">{{ t('settings.agent.deepseekApiKeyHint') }}</p>
    </div>

    <div v-else-if="provider === 'gemini'" class="space-y-1.5">
      <div class="text-sm font-medium">{{ t('settings.agent.geminiApiKey') }}</div>
      <Input
        v-model="geminiApiKey"
        type="password"
        autocomplete="off"
        class="max-w-sm"
        @blur="saveAgentSetting('agent_gemini_api_key', geminiApiKey)"
      />
      <p class="text-xs text-muted-foreground">{{ t('settings.agent.geminiApiKeyHint') }}</p>
    </div>

    <template v-else-if="provider === 'openai'">
      <div class="space-y-1.5">
        <div class="text-sm font-medium">{{ t('settings.agent.openaiApiKey') }}</div>
        <Input
          v-model="openaiApiKey"
          type="password"
          autocomplete="off"
          class="max-w-sm"
          @blur="saveAgentSetting('agent_openai_api_key', openaiApiKey)"
        />
        <p class="text-xs text-muted-foreground">{{ t('settings.agent.openaiApiKeyHint') }}</p>
      </div>

      <div class="space-y-1.5">
        <div class="text-sm font-medium">{{ t('settings.agent.openaiBaseUrl') }}</div>
        <Input
          v-model="openaiBaseUrl"
          placeholder="https://api.openai.com/v1"
          class="max-w-sm"
          @blur="saveAgentSetting('agent_openai_base_url', openaiBaseUrl)"
        />
        <p class="text-xs text-muted-foreground">{{ t('settings.agent.openaiBaseUrlHint') }}</p>
      </div>

      <div class="space-y-1.5">
        <div class="text-sm font-medium">{{ t('settings.agent.openaiModel') }}</div>
        <Input
          v-model="openaiModel"
          placeholder="gpt-4o-mini"
          class="max-w-sm"
          @blur="saveAgentSetting('agent_openai_model', openaiModel)"
        />
        <p class="text-xs text-muted-foreground">{{ t('settings.agent.openaiModelHint') }}</p>
      </div>
    </template>

    <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-2">
      {{ t('settings.agent.instructionsSectionTitle') }}
    </div>

    <div class="space-y-1.5">
      <div class="text-sm font-medium">{{ t('settings.agent.instructions') }}</div>
      <p class="text-xs text-muted-foreground">{{ t('settings.agent.instructionsHint') }}</p>
      <InstructionsTextarea
        v-model="instructions"
        :placeholder="t('settings.agent.instructionsPlaceholder')"
        class="max-w-xl"
        @blur="saveInstructions"
      />
    </div>

    <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-2">
      {{ t('settings.agent.mcpSectionTitle') }}
    </div>

    <div class="space-y-1.5">
      <div class="text-sm font-medium">{{ t('settings.agent.mcpToken') }}</div>
      <Input
        v-model="mcpToken"
        type="password"
        autocomplete="off"
        class="max-w-sm"
        @blur="saveAgentSetting('agent_mcp_token', mcpToken)"
      />
      <p class="text-xs text-muted-foreground">{{ t('settings.agent.mcpTokenHint') }}</p>
    </div>

    <div class="space-y-1.5">
      <div class="text-sm font-medium">{{ t('settings.agent.mcpUrl') }}</div>
      <Input
        v-model="mcpUrl"
        :placeholder="DEFAULT_MCP_URL"
        class="max-w-sm"
        @blur="saveAgentSetting('agent_mcp_url', mcpUrl)"
      />
      <p class="text-xs text-muted-foreground">{{ t('settings.agent.mcpUrlHint') }}</p>
    </div>
  </section>
</template>
