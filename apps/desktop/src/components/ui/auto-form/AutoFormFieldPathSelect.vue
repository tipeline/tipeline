<script setup lang="ts">
import { useField } from 'vee-validate'
import type { FieldProps } from './interface'
import { FolderOpen } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { FormDescription, FormItem, FormMessage } from '@/components/ui/form'
import AutoFormLabel from './AutoFormLabel.vue'
import TemplateField from './TemplateField.vue'
import { beautifyObjectName, TEXT_VARIABLE_TYPES } from './utils'

const props = defineProps<FieldProps>()

const { value, setValue } = useField<any>(props.fieldName)

const dialogMode = props.config?.dialogMode ?? 'open'
const ALL_FILES_FILTER = [{ name: 'All Files', extensions: ['*'] }]

async function browse() {
  if (dialogMode === 'save') {
    const result = await window.ipcRenderer.invoke('dialog:save-file', {
      filters: ALL_FILES_FILTER,
    })
    if (result?.success && result.filePath) setValue(result.filePath)
  } else {
    const filePath = await window.ipcRenderer.invoke('dialog:open-file', {
      filters: ALL_FILES_FILTER,
    })
    if (filePath) setValue(filePath)
  }
}
</script>

<template>
  <FormItem>
    <AutoFormLabel v-if="!config?.hideLabel" :required="required">
      {{ config?.label || beautifyObjectName(label ?? fieldName) }}
    </AutoFormLabel>
    <div class="flex gap-1.5">
      <!-- Paths are often built from variables (`{{ folder }}/report.pdf`): the same
           expression field as other text params, plus Browse. -->
      <TemplateField
        class="flex-1"
        :model-value="typeof value === 'string' ? value : ''"
        :disabled="disabled"
        :placeholder="String(config?.inputProps?.placeholder ?? '/path/to/file')"
        :variable-type="config?.variableType ?? TEXT_VARIABLE_TYPES"
        @update:model-value="setValue"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        :disabled="disabled"
        title="Browse…"
        @click="browse"
      >
        <FolderOpen :size="15" />
      </Button>
    </div>
    <FormDescription v-if="config?.description">{{ config.description }}</FormDescription>
    <FormMessage />
  </FormItem>
</template>
