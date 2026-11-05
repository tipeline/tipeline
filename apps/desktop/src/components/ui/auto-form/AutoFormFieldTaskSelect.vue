<script setup lang="ts">
import type { FieldProps } from './interface'
import { coreValidations } from '@tipeline/schemas'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FormControl, FormDescription, FormField, FormItem, FormMessage } from '@/components/ui/form'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useQuery } from '@/composables/useQuery'
import { SEND } from '@/ipc-channels'
import { cn } from '@/lib/utils'
import { useTaskStore } from '@/store/task'
import { invokeCore } from '@/utils/invoke'
import { Check, ChevronsUpDown, Plus, X } from 'lucide-vue-next'
import { computed, inject, ref } from 'vue'
import AutoForm from './AutoForm.vue'
import AutoFormLabel from './AutoFormLabel.vue'
import { beautifyObjectName, maybeBooleanishToBoolean } from './utils'

defineProps<FieldProps>()

interface TaskOption {
  identifier: string
  name: string
}

const taskStore = useTaskStore()
const { data: tasks, isLoading, refetch } = useQuery<TaskOption[]>(SEND.TASK_LIST)
const open = ref(false)

// Provided by TaskDialogActionEdit only for the subtask action's picker: lets
// this generic field hand off "task was just created, here's its identifier"
// so the dialog can persist it onto the action (this component has no access
// to the actual pipeline action object) and jump straight into its builder,
// same as the existing "Open subtask builder" button does for an
// already-picked subtask.
const onTaskCreated = inject<(identifier: string) => void>('onSubtaskCreated', () => {})

const showCreateDialog = ref(false)
const isCreatingTask = ref(false)
const createTaskSchema = coreValidations.taskObject.taskMetaCreationSchema.pick({
  name: true,
  description: true,
})
const createTaskFieldConfig = {
  description: coreValidations.taskObject.taskMetaCreationFieldConfig.description,
}

function openCreateDialog() {
  open.value = false
  showCreateDialog.value = true
}

async function handleCreateTask(data: { name: string; description: string }, onUpdateModelValue?: (value: string) => void) {
  isCreatingTask.value = true
  try {
    const source = { ...data, version: '1.0.0', pipeline: { variables: [], actions: [] } }
    const response = await invokeCore<{ identifier: string }>(SEND.TASK_NEW, {
      data: { ...data, version: '1.0.0', source: JSON.stringify(source), metadata: {} },
    })
    await refetch()
    onUpdateModelValue?.(response.identifier)
    showCreateDialog.value = false
    onTaskCreated(response.identifier)
  } finally {
    isCreatingTask.value = false
  }
}

// A task running itself (directly or transitively) is a recursion bug, not a
// valid pipeline — so it's never offered as a choice here. The core engine
// also rejects it at execution time as a backstop for tasks edited outside
// this picker (e.g. raw YAML/JSON source).
const selectableTasks = computed(() =>
  (tasks.value ?? []).filter((task) => task.identifier !== taskStore.currentTask?.identifier)
)

function taskName(identifier: unknown): string | undefined {
  if (typeof identifier !== 'string' || !identifier) return undefined
  return tasks.value?.find((task) => task.identifier === identifier)?.name
}
</script>

<template>
  <FormField v-slot="slotProps" :name="fieldName">
    <FormItem>
      <AutoFormLabel v-if="!config?.hideLabel" :required="required">
        {{ config?.label || beautifyObjectName(label ?? fieldName) }}
      </AutoFormLabel>
      <FormControl>
        <slot v-bind="slotProps">
          <Popover v-model:open="open">
            <PopoverTrigger as-child :disabled="maybeBooleanishToBoolean(config?.inputProps?.disabled) ?? disabled">
              <Button
                variant="outline"
                role="combobox"
                :aria-expanded="open"
                :class="cn(
                  'w-full justify-between font-normal',
                  !slotProps.componentField.modelValue && 'text-muted-foreground',
                )"
              >
                <span class="truncate">
                  {{ taskName(slotProps.componentField.modelValue) ?? slotProps.componentField.modelValue ?? config?.inputProps?.placeholder ?? 'Select a workflow…' }}
                </span>
                <span class="flex items-center gap-1 shrink-0">
                  <X
                    v-if="slotProps.componentField.modelValue"
                    class="size-3.5 opacity-60 hover:opacity-100"
                    @click.stop="slotProps.componentField['onUpdate:modelValue']?.(undefined)"
                  />
                  <ChevronsUpDown class="size-4 opacity-50" />
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-80 p-0" align="start">
              <Command
                v-bind="slotProps.componentField"
                @update:model-value="open = false"
              >
                <CommandInput placeholder="Search workflows by name or identifier…" />
                <CommandList>
                  <CommandEmpty>{{ isLoading ? 'Loading workflows…' : 'No workflows found.' }}</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      v-for="task in selectableTasks"
                      :key="task.identifier"
                      :value="task.identifier"
                      class="flex items-center gap-2"
                    >
                      <Check
                        :class="cn(
                          'size-4 shrink-0',
                          slotProps.componentField.modelValue === task.identifier ? 'opacity-100' : 'opacity-0',
                        )"
                      />
                      <div class="flex flex-col overflow-hidden">
                        <span class="truncate">{{ task.name }}</span>
                        <span class="truncate text-xs text-muted-foreground">{{ task.identifier }}</span>
                      </div>
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
              <div class="border-t p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  class="w-full justify-start gap-2 font-normal"
                  @click="openCreateDialog"
                >
                  <Plus class="size-4" />
                  Create new task…
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Dialog v-model:open="showCreateDialog">
            <DialogContent class="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create new workflow</DialogTitle>
                <DialogDescription>
                  You'll be taken straight to its empty builder to start adding steps.
                </DialogDescription>
              </DialogHeader>
              <AutoForm
                :schema="createTaskSchema"
                :field-config="createTaskFieldConfig"
                class="space-y-4"
                @submit="(data) => handleCreateTask(data, slotProps.componentField['onUpdate:modelValue'])"
              >
                <div class="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" @click="showCreateDialog = false">Cancel</Button>
                  <Button type="submit" :disabled="isCreatingTask">
                    {{ isCreatingTask ? 'Creating…' : 'Create' }}
                  </Button>
                </div>
              </AutoForm>
            </DialogContent>
          </Dialog>
        </slot>
      </FormControl>
      <FormDescription v-if="config?.description">
        {{ config.description }}
      </FormDescription>
      <FormMessage />
    </FormItem>
  </FormField>
</template>
