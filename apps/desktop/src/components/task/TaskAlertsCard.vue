<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatDistanceToNow } from 'date-fns';
import { BellRing } from 'lucide-vue-next';
import Card from '@/components/Card.vue';
import { Button } from '@/components/ui/button';
import { invokeCore } from '@/utils/invoke';
import { SEND } from '@/ipc-channels';
import { toast } from '@/components/ui/sonner';
import { useAlertsStore, type AlertItem } from '@/store/alertsStore';

// A workflow's alerts on its Overview: open ones, and acknowledged ones (dismissed, still
// raised quietly until the workflow resolves them), which can be put back in Needs you.
// Hidden when the workflow has none.
const props = defineProps<{ taskIdentifier: string }>();

const { t } = useI18n();
const router = useRouter();
const store = useAlertsStore();
const items = ref<AlertItem[]>([]);

async function load() {
  try {
    const all = await invokeCore<AlertItem[]>(SEND.ALERT_LIST, {
      taskIdentifier: props.taskIdentifier,
      includeClosed: true,
    });
    items.value = all.filter((a) => a.status !== 'resolved');
  } catch {
    items.value = [];
  }
}

// Again whenever the global list changes (a run raised or resolved one, or it was dismissed).
watch(() => [props.taskIdentifier, store.items], load, { immediate: true });

const shown = computed(() =>
  [...items.value].sort(
    (a, b) => Number(a.status !== 'open') - Number(b.status !== 'open')
  )
);

const LEVEL_DOT: Record<string, string> = {
  info: 'bg-blue-500',
  warning: 'bg-orange-500',
  critical: 'bg-red-600',
};

function seeRun(alert: AlertItem) {
  if (!alert.pipelineIdentifier) return;
  router.push({
    name: 'PipelineDetail',
    params: { tid: alert.taskIdentifier, pipelineId: alert.pipelineIdentifier },
  });
}

async function act(alert: AlertItem) {
  try {
    if (alert.status === 'open') await store.dismiss(alert);
    else await store.reopen(alert);
    await load();
  } catch (e: any) {
    toast.error(e?.message ?? String(e));
  }
}
</script>

<template>
  <Card v-if="shown.length" class="shrink-0 flex flex-col">
    <template #title>
      <span class="inline-flex items-center gap-2">
        <BellRing class="size-4 text-orange-500" aria-hidden="true" />
        {{ t('alerts.overviewTitle') }}
      </span>
    </template>
    <template #content>
      <ul class="m-0 p-0 list-none flex flex-col divide-y divide-border">
        <li
          v-for="alert in shown"
          :key="alert.id"
          class="flex flex-wrap items-start gap-x-3 gap-y-2 py-2.5 first:pt-0 last:pb-0"
        >
          <span
            class="mt-1.5 size-2 rounded-full shrink-0"
            :class="LEVEL_DOT[alert.level]"
            :title="t(`alerts.level.${alert.level}`)"
          />
          <div class="flex-1 min-w-40">
            <p class="text-sm font-semibold m-0">
              {{ alert.title }}
              <span
                v-if="alert.count > 1"
                class="font-normal text-muted-foreground"
                >×{{ alert.count }}</span
              >
            </p>
            <p
              v-if="alert.message"
              class="text-xs text-muted-foreground m-0 mt-0.5"
            >
              {{ alert.message }}
            </p>
            <p class="text-xs text-muted-foreground m-0 mt-0.5">
              {{
                formatDistanceToNow(new Date(alert.lastRaisedAt), {
                  addSuffix: true,
                })
              }}
              <template v-if="alert.status === 'dismissed'"
                >· {{ t('alerts.acknowledged') }}</template
              >
            </p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <Button
              v-if="alert.pipelineIdentifier"
              size="sm"
              variant="outline"
              @click="seeRun(alert)"
            >
              {{ t('dashboard.needs.seeRun') }}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              :disabled="store.dismissing === alert.id"
              @click="act(alert)"
            >
              {{
                alert.status === 'open'
                  ? t('dashboard.needs.dismiss')
                  : t('alerts.reopen')
              }}
            </Button>
          </div>
        </li>
      </ul>
    </template>
  </Card>
</template>
