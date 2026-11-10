<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Check, ChevronDown, X } from 'lucide-vue-next';
import { useQuery } from '@/composables/useQuery';
import { SEND } from '@/ipc-channels';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

// The projects a workflow or app is in, by identifier: none, one or several. A project is
// a label for organising; who may see or run the workflow doesn't depend on it.
const model = defineModel<string[]>({ default: () => [] });
defineProps<{ hideLabel?: boolean }>();

const { t } = useI18n();
const { data: projects } = useQuery(SEND.PROJECT_LIST);

type Project = { identifier: string; name: string; color?: string | null };
const all = computed<Project[]>(() => ((projects.value as Project[] | undefined) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)));
const chosen = computed(() => all.value.filter((p) => model.value.includes(p.identifier)));
const remove = (identifier: string) => (model.value = model.value.filter((id) => id !== identifier));
</script>

<template>
  <div class="space-y-1.5">
    <label v-if="!hideLabel" class="text-sm font-medium">
      {{ t('tasks.form.projects') }}
      <span class="text-muted-foreground font-normal">{{ t('common.optional') }}</span>
    </label>
    <Popover>
      <PopoverTrigger as-child>
        <button
          type="button"
          class="flex min-h-9 w-full items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
        >
          <span v-if="!chosen.length" class="flex-1 text-muted-foreground">{{ t('tasks.form.projectPlaceholder') }}</span>
          <span v-else class="flex flex-1 flex-wrap gap-1">
            <span
              v-for="project in chosen"
              :key="project.identifier"
              class="inline-flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs"
            >
              <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: project.color || 'var(--muted-foreground)' }" />
              <span class="truncate">{{ project.name }}</span>
              <X
                class="size-3 shrink-0 opacity-60 hover:opacity-100"
                :aria-label="t('tasks.form.removeProject', { name: project.name })"
                @click.stop="remove(project.identifier)"
              />
            </span>
          </span>
          <ChevronDown class="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent class="w-(--reka-popover-trigger-width) min-w-56 p-0" align="start">
        <Command :multiple="true" :model-value="model" @update:model-value="model = ($event as string[])">
          <CommandInput :placeholder="t('tasks.form.searchProjects')" />
          <CommandList>
            <CommandEmpty>{{ t('tasks.form.noProjects') }}</CommandEmpty>
            <CommandGroup>
              <CommandItem v-for="project in all" :key="project.identifier" :value="project.identifier">
                <Check class="size-4 shrink-0" :class="model.includes(project.identifier) ? 'opacity-100' : 'opacity-0'" />
                <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: project.color || 'var(--muted-foreground)' }" />
                <span class="truncate">{{ project.name }}</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>
</template>
