<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// How long a step's (or workflow's) result is reused. '' = off. The value is the TTL
// as stored in the workflow source ('15m', '1h', …); a TTL written by hand in YAML that
// isn't one of the presets is kept and shown as it is.
const model = defineModel<string>({ default: '' });

defineProps<{
  label: string;
  hint: string;
}>();

const { t } = useI18n();

const PRESETS = ['1m', '5m', '15m', '1h', '6h', '1d', '7d'] as const;
const OFF = '__off__';

const options = computed(() => {
  const list: Array<{ value: string; label: string }> = [{ value: OFF, label: t('cache.ttl.off') }];
  for (const value of PRESETS) list.push({ value, label: t(`cache.ttl.${value}`) });
  if (model.value && !(PRESETS as readonly string[]).includes(model.value)) {
    list.push({ value: model.value, label: t('cache.ttl.custom', { ttl: model.value }) });
  }
  return list;
});

const selected = computed({
  get: () => model.value || OFF,
  set: (value: string) => {
    model.value = value === OFF ? '' : value;
  },
});
</script>

<template>
  <div class="space-y-2">
    <Label>{{ label }}</Label>
    <Select v-model="selected">
      <SelectTrigger class="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="option in options" :key="option.value" :value="option.value">
          {{ option.label }}
        </SelectItem>
      </SelectContent>
    </Select>
    <p class="text-xs text-muted-foreground">{{ hint }}</p>
  </div>
</template>
