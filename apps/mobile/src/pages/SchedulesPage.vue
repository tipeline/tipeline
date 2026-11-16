<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonList,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonLabel,
  IonToggle,
  IonSelect,
  IonSelectOption,
  IonButton,
  IonIcon,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  IonSkeletonText,
  onIonViewDidEnter,
} from '@ionic/vue';
import { checkmarkOutline, lockClosedOutline } from 'ionicons/icons';
import { nextCronRuns } from '@tipeline/utils';
import ConnectionBanner from '@/components/ConnectionBanner.vue';
import TextField from '@/components/TextField.vue';
import { useSession } from '@/session';
import { useInbox } from '@/inboxStore';
import { confirmAction } from '@/lib/confirm';
import { isListed } from '@/lib/workflows';
import { formatDateTime, phoneZone, previewWhen, repeatText, scheduleState } from '@/lib/schedules';
import type { ScheduleItem } from '@/lib/inbox';

const { t, locale } = useI18n();
const session = useSession();
const inbox = useInbox();

// Only admins may add, change or delete schedules (the Server refuses others too).
const isAdmin = computed(() => session.user?.role === 'admin');

const schedules = computed(() =>
  [...inbox.schedules].sort((a, b) => a.taskName.localeCompare(b.taskName) || a.scheduleIdentifier.localeCompare(b.scheduleIdentifier))
);
const workflows = computed(() =>
  inbox.workflows.filter(isListed).sort((a, b) => a.name.localeCompare(b.name))
);

// Repeating times follow Core's time zone. The schedule list says which; with none yet,
// the time zone setting (when set) does.
const zoneSetting = ref('');
onIonViewDidEnter(async () => {
  void inbox.refresh();
  try {
    const settings = await session.api().request<Record<string, string>>('settingsList');
    zoneSetting.value = settings?.timezone ?? '';
  } catch {
    zoneSetting.value = '';
  }
});
const serverZone = computed(() => inbox.schedules.find((s) => s.timezone)?.timezone || zoneSetting.value);
const otherZone = computed(() => (serverZone.value && serverZone.value !== phoneZone() ? serverZone.value : ''));

async function refresh(ev: CustomEvent) {
  await inbox.refresh();
  (ev.target as HTMLIonRefresherElement).complete();
}

function whenLine(s: ScheduleItem): string {
  return repeatText(s, locale.value) ?? t('schedules.once', { date: formatDateTime(s.runAt, locale.value) });
}
function stateLine(s: ScheduleItem): { text: string; tone: string } {
  const state = scheduleState(s);
  if (state === 'done') return { text: t('schedules.done'), tone: 'muted' };
  if (state === 'paused') return { text: t('schedules.paused'), tone: 'waiting' };
  if (s.missedAt) return { text: t('schedules.missed', { date: formatDateTime(s.missedAt, locale.value) }), tone: 'failed' };
  return { text: s.nextRunAt ? t('schedules.next', { date: formatDateTime(s.nextRunAt, locale.value) }) : '', tone: 'muted' };
}

// ---- New schedule (admins) ------------------------------------------------------------
const newWorkflow = ref<string | null>(null);
const when = ref('');
const adding = ref(false);
const addError = ref('');
const preview = computed(() => (when.value.trim() ? previewWhen(when.value, locale.value) : null));
const previewText = computed(() => {
  const p = preview.value;
  if (!p) return '';
  if (!p.ok) return locale.value.startsWith('en') ? p.message : t(`schedules.errors.${p.error}`);
  if (p.kind === 'once') return t('schedules.once', { date: formatDateTime(p.at, locale.value) });
  if ('cron' in p.timing && otherZone.value) return `${p.text} (${otherZone.value})`;
  const next = 'cron' in p.timing ? nextCronRuns(p.timing.cron, 1)[0] : null;
  return next ? `${p.text} · ${t('schedules.next', { date: formatDateTime(next, locale.value) })}` : p.text;
});
const canAdd = computed(() => !!newWorkflow.value && !!preview.value?.ok && !adding.value);

async function add() {
  const p = preview.value;
  if (!newWorkflow.value || !p?.ok) return;
  adding.value = true;
  addError.value = '';
  try {
    await session.api().request('scheduleSet', { identifier: newWorkflow.value, ...p.timing });
    when.value = '';
    newWorkflow.value = null;
    await inbox.refresh();
  } catch (err) {
    addError.value = t('schedules.addFailed', { message: (err as Error).message });
  } finally {
    adding.value = false;
  }
}

// ---- Changing one (admins) ------------------------------------------------------------
const busy = ref<string | null>(null);
const changeError = ref('');
async function toggle(s: ScheduleItem, enabled: boolean) {
  busy.value = s.scheduleIdentifier;
  changeError.value = '';
  try {
    await session.api().request('scheduleToggle', { scheduleIdentifier: s.scheduleIdentifier, enabled });
    await inbox.refresh();
  } catch (err) {
    changeError.value = t('schedules.changeFailed', { message: (err as Error).message });
    await inbox.refresh();
  } finally {
    busy.value = null;
  }
}
async function remove(s: ScheduleItem, sliding?: HTMLIonItemSlidingElement) {
  await sliding?.close();
  const sure = await confirmAction({
    header: t('schedules.deleteTitle'),
    message: t('schedules.deleteBody', { name: s.taskName }),
    confirm: t('schedules.delete'),
    cancel: t('schedules.keep'),
    destructive: true,
  });
  if (!sure) return;
  busy.value = s.scheduleIdentifier;
  changeError.value = '';
  try {
    await session.api().request('scheduleRemove', { scheduleIdentifier: s.scheduleIdentifier });
    await inbox.refresh();
  } catch (err) {
    changeError.value = t('schedules.changeFailed', { message: (err as Error).message });
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/home" />
        </ion-buttons>
        <ion-title>{{ t('schedules.title') }}</ion-title>
      </ion-toolbar>
      <connection-banner />
    </ion-header>

    <ion-content class="ion-padding">
      <ion-refresher slot="fixed" @ion-refresh="refresh">
        <ion-refresher-content />
      </ion-refresher>

      <section v-if="isAdmin" class="tl-card new">
        <h2>{{ t('schedules.newTitle') }}</h2>
        <div class="field">
          <span class="label">{{ t('schedules.workflow') }}</span>
          <ion-select
            v-model="newWorkflow"
            interface="action-sheet"
            :placeholder="t('schedules.chooseWorkflow')"
            :aria-label="t('schedules.workflow')"
            class="picker"
          >
            <ion-select-option v-for="w in workflows" :key="w.identifier" :value="w.identifier">{{ w.name }}</ion-select-option>
          </ion-select>
        </div>
        <text-field
          v-model="when"
          name="when"
          :label="t('schedules.when')"
          :hint="preview ? undefined : t('schedules.whenHint')"
          :error="preview && !preview.ok ? previewText : undefined"
          @keyup.enter="add"
        />
        <p v-if="preview?.ok" class="preview">
          <ion-icon :icon="checkmarkOutline" aria-hidden="true" />{{ previewText }}
        </p>
        <p v-if="addError" class="tl-error" role="alert">{{ addError }}</p>
        <ion-button expand="block" :disabled="!canAdd" @click="add">
          <ion-spinner v-if="adding" name="crescent" aria-hidden="true" />{{ adding ? t('schedules.adding') : t('schedules.add') }}
        </ion-button>
      </section>
      <p v-else class="tl-muted locked">
        <ion-icon :icon="lockClosedOutline" aria-hidden="true" />{{ t('schedules.adminOnly') }}
      </p>

      <p v-if="changeError" class="tl-error" role="alert">{{ changeError }}</p>

      <div v-if="!inbox.loaded" aria-busy="true">
        <ion-skeleton-text v-for="n in 4" :key="n" animated style="width: 100%; height: 64px; border-radius: 12px" />
      </div>
      <p v-else-if="schedules.length === 0" class="tl-muted">{{ t('schedules.empty') }}</p>
      <ion-list v-else lines="full" class="list">
        <ion-item-sliding v-for="s in schedules" :key="s.scheduleIdentifier" :disabled="!isAdmin">
          <ion-item>
            <ion-label class="ion-text-wrap">
              <router-link :to="`/tabs/workflows/${encodeURIComponent(s.taskIdentifier)}`" class="name">{{ s.taskName }}</router-link>
              <p>{{ whenLine(s) }}</p>
              <p v-if="stateLine(s).text" :class="['state', stateLine(s).tone]">{{ stateLine(s).text }}</p>
            </ion-label>
            <ion-toggle
              v-if="isAdmin && scheduleState(s) !== 'done'"
              slot="end"
              :checked="s.enabled"
              :disabled="busy === s.scheduleIdentifier"
              :aria-label="t('schedules.turnedOn', { name: s.taskName })"
              @ion-change="toggle(s, $event.detail.checked)"
            />
          </ion-item>
          <ion-item-options side="end">
            <ion-item-option color="danger" @click="remove(s, ($event.target as HTMLElement).closest('ion-item-sliding') ?? undefined)">
              {{ t('schedules.delete') }}
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.new {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.new h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.label {
  font-size: 14px;
  font-weight: 600;
}
.picker {
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--tl-border);
  border-radius: 10px;
  background: var(--tl-card);
}
.preview {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -4px 0 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--tl-success-ink);
}
.new ion-button {
  --border-radius: 12px;
  margin: 0;
  font-weight: 600;
}
.new ion-spinner {
  width: 16px;
  height: 16px;
  margin-right: 6px;
}
.locked {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 14px;
}
.list {
  margin-top: 16px;
  border-radius: 14px;
  border: 1px solid var(--tl-border);
  padding: 0;
}
.name {
  font-size: 15px;
  font-weight: 600;
  color: var(--tl-ink);
  text-decoration: none;
}
.list p {
  font-size: 13px;
}
.state.waiting {
  color: var(--tl-waiting-ink);
}
.state.failed {
  color: var(--tl-failed-ink);
}
</style>
