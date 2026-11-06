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
import { useAgentStore } from '@/store/agentStore';
import { useAutoSave } from '@/composables/useAutoSave';
import SaveStatus from '@/components/SaveStatus.vue';
import { PROVIDERS, PROVIDER_LABELS, type ProviderName } from '@tipeline/agent/provider-names';
import { INSTRUCTIONS_SETTING } from '@tipeline/agent/instructions';
import InstructionsTextarea from '@/components/agent/InstructionsTextarea.vue';

const store = useSettingsStore();
const agentStore = useAgentStore();
const { t } = useI18n();
const autoSave = useAutoSave();

const DEFAULT_MCP_URL = 'http://127.0.0.1:4002/mcp';

// Empty until the user picks one: Tipeline comes with no provider.
const provider = ref<ProviderName | ''>('');
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

// Fill the fields when settings (re)load. Not deep: saving a field changes one key, and
// copying it back would undo whatever was typed while the save was on its way.
watch(
  () => store.settings,
  () => {
    provider.value = agentStore.chosenProvider() ?? '';
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
  { immediate: true }
);

function storedValue(key: string, value: string) {
  if (key === INSTRUCTIONS_SETTING) return value.trim();
  return value || (key === 'agent_mcp_url' ? DEFAULT_MCP_URL : '');
}

// Saves a text setting a moment after typing stops (and at once on blur, via flush).
function queueSave(key: string, value: string) {
  autoSave.schedule(key, async () => {
    const stored = storedValue(key, value);
    if (stored !== store.get(key)) await store.set(key, stored);
  });
}

function saveProvider(value: ProviderName) {
  provider.value = value;
  void autoSave.save('agent_provider', () => store.set('agent_provider', value));
}

onMounted(async () => {
  await store.load();
  // Nothing to paste in manually for the common case (Core running locally): the MCP
  // server auths with Core's own API token, so default the field to that unless the
  // user has already set something else (e.g. a token for a remote Core).
  if (!store.get('agent_mcp_token')) {
    const token = await store.getApiToken().catch(() => '');
    if (token) {
      await store.set('agent_mcp_token', token);
      if (!mcpToken.value) mcpToken.value = token;
    }
  }
});
</script>

<template>
  <section class="space-y-6">
    <p class="text-sm text-muted-foreground">{{ t('settings.autoSave.note') }}</p>

    <div class="flex items-center justify-between">
      <div>
        <div class="text-sm font-medium">{{ t('settings.agent.provider') }}</div>
        <div class="text-xs text-muted-foreground mt-0.5">{{ t('settings.agent.providerHint') }}</div>
      </div>
      <div class="flex items-center gap-3">
        <SaveStatus v-bind="autoSave.status('agent_provider')" />
        <Select :model-value="provider" @update:model-value="saveProvider($event as ProviderName)">
          <SelectTrigger class="w-40 text-sm">
            <SelectValue :placeholder="t('agent.setup.chooseProvider')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="p in PROVIDERS" :key="p" :value="p">{{ PROVIDER_LABELS[p] }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <template v-if="provider === 'anthropic'">
      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-3 max-w-sm">
          <div class="text-sm font-medium">{{ t('settings.agent.anthropicApiKey') }}</div>
          <SaveStatus v-bind="autoSave.status('agent_anthropic_api_key')" />
        </div>
        <Input
          v-model="anthropicApiKey"
          type="password"
          autocomplete="off"
          class="max-w-sm"
          @update:model-value="queueSave('agent_anthropic_api_key', String($event))"
          @blur="autoSave.flush('agent_anthropic_api_key')"
        />
        <p class="text-xs text-muted-foreground">{{ t('settings.agent.anthropicApiKeyHint') }}</p>
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-3 max-w-sm">
          <div class="text-sm font-medium">{{ t('settings.agent.anthropicModel') }}</div>
          <SaveStatus v-bind="autoSave.status('agent_anthropic_model')" />
        </div>
        <Input
          v-model="anthropicModel"
          placeholder="claude-opus-5-5"
          class="max-w-sm"
          @update:model-value="queueSave('agent_anthropic_model', String($event))"
          @blur="autoSave.flush('agent_anthropic_model')"
        />
        <p class="text-xs text-muted-foreground">{{ t('settings.agent.anthropicModelHint') }}</p>
      </div>
    </template>

    <div v-else-if="provider === 'deepseek'" class="space-y-1.5">
      <div class="flex items-center justify-between gap-3 max-w-sm">
        <div class="text-sm font-medium">{{ t('settings.agent.deepseekApiKey') }}</div>
        <SaveStatus v-bind="autoSave.status('agent_deepseek_api_key')" />
      </div>
      <Input
        v-model="deepseekApiKey"
        type="password"
        autocomplete="off"
        class="max-w-sm"
        @update:model-value="queueSave('agent_deepseek_api_key', String($event))"
        @blur="autoSave.flush('agent_deepseek_api_key')"
      />
      <p class="text-xs text-muted-foreground">{{ t('settings.agent.deepseekApiKeyHint') }}</p>
    </div>

    <div v-else-if="provider === 'gemini'" class="space-y-1.5">
      <div class="flex items-center justify-between gap-3 max-w-sm">
        <div class="text-sm font-medium">{{ t('settings.agent.geminiApiKey') }}</div>
        <SaveStatus v-bind="autoSave.status('agent_gemini_api_key')" />
      </div>
      <Input
        v-model="geminiApiKey"
        type="password"
        autocomplete="off"
        class="max-w-sm"
        @update:model-value="queueSave('agent_gemini_api_key', String($event))"
        @blur="autoSave.flush('agent_gemini_api_key')"
      />
      <p class="text-xs text-muted-foreground">{{ t('settings.agent.geminiApiKeyHint') }}</p>
    </div>

    <template v-else-if="provider === 'openai'">
      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-3 max-w-sm">
          <div class="text-sm font-medium">{{ t('settings.agent.openaiApiKey') }}</div>
          <SaveStatus v-bind="autoSave.status('agent_openai_api_key')" />
        </div>
        <Input
          v-model="openaiApiKey"
          type="password"
          autocomplete="off"
          class="max-w-sm"
          @update:model-value="queueSave('agent_openai_api_key', String($event))"
          @blur="autoSave.flush('agent_openai_api_key')"
        />
        <p class="text-xs text-muted-foreground">{{ t('settings.agent.openaiApiKeyHint') }}</p>
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-3 max-w-sm">
          <div class="text-sm font-medium">{{ t('settings.agent.openaiBaseUrl') }}</div>
          <SaveStatus v-bind="autoSave.status('agent_openai_base_url')" />
        </div>
        <Input
          v-model="openaiBaseUrl"
          placeholder="https://api.openai.com/v1"
          class="max-w-sm"
          @update:model-value="queueSave('agent_openai_base_url', String($event))"
          @blur="autoSave.flush('agent_openai_base_url')"
        />
        <p class="text-xs text-muted-foreground">{{ t('settings.agent.openaiBaseUrlHint') }}</p>
      </div>

      <div class="space-y-1.5">
        <div class="flex items-center justify-between gap-3 max-w-sm">
          <div class="text-sm font-medium">{{ t('settings.agent.openaiModel') }}</div>
          <SaveStatus v-bind="autoSave.status('agent_openai_model')" />
        </div>
        <Input
          v-model="openaiModel"
          placeholder="gpt-4o-mini"
          class="max-w-sm"
          @update:model-value="queueSave('agent_openai_model', String($event))"
          @blur="autoSave.flush('agent_openai_model')"
        />
        <p class="text-xs text-muted-foreground">{{ t('settings.agent.openaiModelHint') }}</p>
      </div>
    </template>

    <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-2">
      {{ t('settings.agent.instructionsSectionTitle') }}
    </div>

    <div class="space-y-1.5">
      <div class="flex items-center justify-between gap-3 max-w-xl">
        <div class="text-sm font-medium">{{ t('settings.agent.instructions') }}</div>
        <SaveStatus v-bind="autoSave.status(INSTRUCTIONS_SETTING)" />
      </div>
      <p class="text-xs text-muted-foreground">{{ t('settings.agent.instructionsHint') }}</p>
      <InstructionsTextarea
        v-model="instructions"
        :placeholder="t('settings.agent.instructionsPlaceholder')"
        class="max-w-xl"
        @update:model-value="queueSave(INSTRUCTIONS_SETTING, $event)"
        @blur="autoSave.flush(INSTRUCTIONS_SETTING)"
      />
    </div>

    <div class="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-2">
      {{ t('settings.agent.mcpSectionTitle') }}
    </div>

    <div class="space-y-1.5">
      <div class="flex items-center justify-between gap-3 max-w-sm">
        <div class="text-sm font-medium">{{ t('settings.agent.mcpToken') }}</div>
        <SaveStatus v-bind="autoSave.status('agent_mcp_token')" />
      </div>
      <Input
        v-model="mcpToken"
        type="password"
        autocomplete="off"
        class="max-w-sm"
        @update:model-value="queueSave('agent_mcp_token', String($event))"
        @blur="autoSave.flush('agent_mcp_token')"
      />
      <p class="text-xs text-muted-foreground">{{ t('settings.agent.mcpTokenHint') }}</p>
    </div>

    <div class="space-y-1.5">
      <div class="flex items-center justify-between gap-3 max-w-sm">
        <div class="text-sm font-medium">{{ t('settings.agent.mcpUrl') }}</div>
        <SaveStatus v-bind="autoSave.status('agent_mcp_url')" />
      </div>
      <Input
        v-model="mcpUrl"
        :placeholder="DEFAULT_MCP_URL"
        class="max-w-sm"
        @update:model-value="queueSave('agent_mcp_url', String($event))"
        @blur="autoSave.flush('agent_mcp_url')"
      />
      <p class="text-xs text-muted-foreground">{{ t('settings.agent.mcpUrlHint') }}</p>
    </div>
  </section>
</template>
