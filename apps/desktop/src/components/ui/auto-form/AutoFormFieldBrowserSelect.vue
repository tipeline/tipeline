<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { Ref } from 'vue'
import { useField } from 'vee-validate'
import type { FieldProps } from './interface'
import { Code2Icon, Link2Icon } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormDescription, FormItem, FormMessage } from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import AutoFormLabel from './AutoFormLabel.vue'
import { beautifyObjectName } from './utils'

type Mode = 'code' | 'variable'

const props = defineProps<FieldProps>()

const { value, setValue } = useField<any>(props.fieldName)

const taskVariables = inject<Ref<{ name: string; type: string }[]> | null>('taskVariables', null)
const showModeToggle = computed(() => taskVariables !== null)

const isVariableRef = (val: any) =>
  typeof val === 'string' && /^\{=\s*.+\s*=\}$/.test(val.trim())

const mode = ref<Mode>(isVariableRef(value.value) || !value.value ? 'variable' : 'code')

const browserVariables = computed(() =>
  (taskVariables?.value ?? []).filter(v => v.type === 'browser')
)

const selectedVariable = computed(() => {
  if (!isVariableRef(value.value)) return ''
  const match = (value.value as string).match(/^\{=\s*(.+?)\s*=\}$/)
  return match ? match[1].trim() : ''
})

const setMode = (newMode: Mode) => {
  if (mode.value === newMode) return
  mode.value = newMode
  if (newMode === 'code') {
    if (typeof value.value !== 'string') setValue('')
  }
}
</script>

<template>
  <FormItem>
    <div class="flex items-center justify-between">
      <AutoFormLabel v-if="!config?.hideLabel" :required="required">
        {{ config?.label || beautifyObjectName(label ?? fieldName) }}
      </AutoFormLabel>
      <div v-if="showModeToggle" class="flex gap-1">
        <Button
          type="button" size="icon" variant="ghost" class="h-6 w-6"
          :class="{ 'bg-muted': mode === 'variable' }"
          title="Select a browser variable"
          @click="setMode('variable')"
        >
          <Link2Icon :size="13" />
        </Button>
        <Button
          type="button" size="icon" variant="ghost" class="h-6 w-6"
          :class="{ 'bg-muted': mode === 'code' }"
          title="Raw text / template"
          @click="setMode('code')"
        >
          <Code2Icon :size="13" />
        </Button>
      </div>
    </div>

    <!-- Variable mode -->
    <Select
      v-if="mode === 'variable' && showModeToggle"
      :model-value="selectedVariable"
      :disabled="disabled"
      @update:model-value="setValue(`{= ${$event} =}`)"
    >
      <SelectTrigger class="w-full">
        <SelectValue placeholder="Select a browser…" />
      </SelectTrigger>
      <SelectContent>
        <template v-if="browserVariables.length > 0">
          <SelectItem v-for="v in browserVariables" :key="v.name" :value="v.name">
            {{ v.name }}
          </SelectItem>
        </template>
        <p v-else class="px-2 py-1.5 text-xs text-muted-foreground">
          No browser variables available
        </p>
      </SelectContent>
    </Select>

    <!-- Code mode (also used as fallback when no task variables are available) -->
    <Input
      v-else
      type="text"
      :model-value="typeof value === 'string' ? value : ''"
      :disabled="disabled"
      :placeholder="config?.inputProps?.placeholder ?? 'e.g. {= myBrowser =}'"
      @update:model-value="setValue($event)"
    />

    <FormDescription v-if="config?.description">{{ config.description }}</FormDescription>
    <FormMessage />
  </FormItem>
</template>
