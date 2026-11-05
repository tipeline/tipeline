<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// The "fx" marker next to a label: this field takes {{ }} / {= =} bindings. Hover
// explains the two syntaxes.
const SAMPLES = {
  template: '{{ … }}',
  raw: '{= … =}',
  example: 'Total: {{ runnables.records.outputs.summary.total }}',
};
const { t } = useI18n();
</script>

<template>
  <Tooltip>
    <TooltipTrigger as-child>
      <span
        class="font-mono text-[10px] leading-none px-1 py-0.5 rounded bg-muted text-muted-foreground cursor-help"
        :aria-label="t('builder.binding.title')"
      >fx</span>
    </TooltipTrigger>
    <TooltipContent class="max-w-72 text-xs leading-relaxed">
      <p class="font-medium m-0 mb-1">{{ t('builder.binding.title') }}</p>
      <p class="m-0"><code class="font-mono">{{ SAMPLES.template }}</code> — {{ t('builder.binding.template') }}</p>
      <p class="m-0"><code class="font-mono">{{ SAMPLES.raw }}</code> — {{ t('builder.binding.raw') }}</p>
      <p class="m-0 mt-1">{{ t('builder.binding.example') }} <code class="font-mono">{{ SAMPLES.example }}</code></p>
      <p class="m-0 mt-1 opacity-80">{{ t('builder.binding.references') }}</p>
    </TooltipContent>
  </Tooltip>
</template>
