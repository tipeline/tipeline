<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Ban, Loader2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/sonner';
import { useCancelStore, type CancelResult, type CancelTarget } from '@/store/cancelStore';
import { useConnectionStore } from '@/store/connectionStore';

// Cancel for one run, after confirming: it ends right away, including the step running
// now. Shows
// "Canceling…" until the run has stopped. Hidden from viewers of a server workspace,
// who can't cancel.
const props = withDefaults(
  defineProps<{
    target: CancelTarget;
    /** The run is waiting for an approval (changes what the dialog says). */
    waiting?: boolean;
    /** button: outlined; link: inline text (status lines); icon: icon only (table rows). */
    variant?: 'button' | 'link' | 'icon';
  }>(),
  { variant: 'button' }
);
const emit = defineEmits<{ done: [result: CancelResult] }>();
const { t } = useI18n();
const cancels = useCancelStore();
const connection = useConnectionStore();

const open = ref(false);
const canceling = computed(() => cancels.isCanceling(props.target));
const allowed = computed(() => !connection.isRemote || connection.serverMe?.role !== 'viewer');

async function confirm() {
  open.value = false;
  try {
    const result = await cancels.cancel(props.target);
    if (result === 'canceled') toast.success(t('runs.cancel.canceled'));
    else if (result === 'not_running') toast.info(t('runs.cancel.notRunning'));
    emit('done', result);
  } catch (e: any) {
    toast.error(t('runs.cancel.failed'), {
      description: e?.message ?? t('common.unknownError'),
    });
  }
}
</script>

<template>
  <template v-if="allowed">
    <span
      v-if="canceling"
      class="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0"
      role="status"
    >
      <Loader2 class="size-3.5 animate-spin" />
      <span v-if="variant !== 'icon'">{{ t('runs.cancel.canceling') }}</span>
    </span>
    <button
      v-else-if="variant === 'link'"
      type="button"
      class="shrink-0 text-xs text-muted-foreground hover:text-destructive underline-offset-2 hover:underline"
      @click.stop="open = true"
    >
      {{ t('runs.cancel.action') }}
    </button>
    <button
      v-else-if="variant === 'icon'"
      type="button"
      class="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
      :title="t('runs.cancel.action')"
      :aria-label="t('runs.cancel.action')"
      @click.stop="open = true"
    >
      <Ban class="size-4" />
    </button>
    <Button v-else variant="outline" size="sm" @click.stop="open = true">
      <Ban class="size-4" />
      {{ t('runs.cancel.action') }}
    </Button>

    <AlertDialog v-model:open="open">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('runs.cancel.title') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ waiting ? t('runs.cancel.descriptionWaiting') : t('runs.cancel.description') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t('runs.cancel.keep') }}</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-white hover:bg-destructive/90"
            @click="confirm"
          >
            {{ t('runs.cancel.confirm') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </template>
</template>
