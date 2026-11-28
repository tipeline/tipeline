<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { TriangleAlert } from 'lucide-vue-next';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

/** A workflow the file being installed may duplicate (Core's TaskService.getInstallMatches). */
export interface InstallMatch {
  identifier: string;
  name: string;
  version: string | null;
  createdAt: string;
  sameFile: boolean;
  /** null: not installed from a file. */
  edited: boolean | null;
}

// Shown when a workflow file looks already installed: replace one of the matches with the
// file, open the identical copy, or install the file again as another workflow.
const props = defineProps<{ fileName: string; matches: InstallMatch[]; busy?: boolean }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ replace: [identifier: string]; copy: []; openExisting: [identifier: string] }>();

const { t } = useI18n();
const selected = ref('');

watch(
  () => [open.value, props.matches] as const,
  ([isOpen]) => {
    if (isOpen) selected.value = props.matches[0]?.identifier ?? '';
  },
  { immediate: true }
);

const choice = computed(() => props.matches.find((m) => m.identifier === selected.value));
// Same file and not changed since: replacing it would change nothing.
const identical = computed(() => !!choice.value?.sameFile && choice.value.edited === false);

const statusOf = (match: InstallMatch) => {
  if (match.sameFile) return match.edited ? t('tasks.installExisting.sameFileEdited') : t('tasks.installExisting.sameFile');
  if (match.edited === null) return t('tasks.installExisting.sameNameMadeHere');
  return match.edited ? t('tasks.installExisting.sameNameEdited') : t('tasks.installExisting.sameNameOtherFile');
};
// Replacing throws away changes made after the install (they stay in Versions).
const losesEdits = (match: InstallMatch) => match.edited !== false;
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('tasks.installExisting.title') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t('tasks.installExisting.description', { file: fileName }, matches.length) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <RadioGroup v-model="selected" class="max-h-64 overflow-y-auto scroll-fade rounded-md border divide-y gap-0">
        <label
          v-for="match in matches"
          :key="match.identifier"
          class="flex items-start gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-accent/50"
        >
          <RadioGroupItem :value="match.identifier" class="mt-0.5" />
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="truncate font-medium">{{ match.name }}</span>
              <span v-if="match.version" class="text-xs text-muted-foreground shrink-0">v{{ match.version }}</span>
            </div>
            <p class="text-xs text-muted-foreground flex items-center gap-1">
              <TriangleAlert
                v-if="match.edited"
                class="w-3 h-3 shrink-0 text-amber-600 dark:text-amber-400"
              />
              {{ statusOf(match) }}
            </p>
          </div>
        </label>
      </RadioGroup>
      <p v-if="choice && !identical" class="text-xs text-muted-foreground">
        {{ losesEdits(choice) ? t('tasks.installExisting.replaceLosesEdits') : t('tasks.installExisting.replaceKeeps') }}
      </p>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="busy">{{ t('common.cancel') }}</AlertDialogCancel>
        <Button variant="outline" :disabled="busy" @click="emit('copy')">
          {{ t('tasks.installExisting.copy') }}
        </Button>
        <Button v-if="identical" :disabled="busy || !choice" @click="emit('openExisting', selected)">
          {{ t('tasks.installExisting.open') }}
        </Button>
        <Button
          v-else
          :disabled="busy || !choice"
          :variant="choice && losesEdits(choice) ? 'destructive' : 'default'"
          @click="emit('replace', selected)"
        >
          {{ t('tasks.installExisting.replace') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
