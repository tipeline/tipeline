<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { isToday, isYesterday } from 'date-fns';
import { LogIn, UserCog, KeyRound, Webhook as WebhookIcon, ShieldAlert } from 'lucide-vue-next';
import { SEND } from '@/ipc-channels';
import WsCard from '@/components/workspace/ui/WsCard.vue';

interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

const props = defineProps<{ host: string; token: string }>();

const entries = ref<AuditEntry[]>([]);
const loading = ref(false);
const error = ref('');
const filter = ref<'all' | 'auth' | 'members' | 'tokens' | 'webhooks'>('all');

const FILTERS: { key: typeof filter.value; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'auth', label: 'Auth' },
  { key: 'members', label: 'Members' },
  { key: 'tokens', label: 'Tokens' },
  { key: 'webhooks', label: 'Webhooks' },
];

function categoryOf(action: string): string {
  if (action.startsWith('user.login') || action.startsWith('user.mfa') || action.startsWith('session.')) return 'auth';
  if (action.startsWith('user.')) return 'members';
  if (action.startsWith('token.')) return 'tokens';
  if (action.startsWith('webhook.')) return 'webhooks';
  return 'all';
}

const filtered = computed(() =>
  filter.value === 'all' ? entries.value : entries.value.filter((e) => categoryOf(e.action) === filter.value)
);

function iconFor(action: string) {
  if (action === 'user.login_failed') return ShieldAlert;
  if (action.startsWith('user.login') || action.startsWith('user.mfa') || action.startsWith('session.')) return LogIn;
  if (action.startsWith('user.')) return UserCog;
  if (action.startsWith('token.')) return KeyRound;
  if (action.startsWith('webhook.')) return WebhookIcon;
  return UserCog;
}

function isBad(action: string): boolean {
  return action === 'user.login_failed';
}

// Segments of the sentence; `b` marks the parts rendered bold (actor, target).
type Segment = { text: string; b?: boolean };

function describe(e: AuditEntry): Segment[] {
  const who: Segment = { text: e.actor_email ?? 'Unknown', b: true };
  const meta = (e.metadata ?? {}) as Record<string, any>;
  const s = (text: string): Segment => ({ text });
  const b = (text: string): Segment => ({ text, b: true });
  switch (e.action) {
    case 'user.login_success': return [who, s(' signed in')];
    case 'user.login_failed': return [s('Failed sign-in attempt for '), who];
    case 'user.mfa_enabled': return [who, s(' enabled two-factor authentication')];
    case 'user.mfa_disabled': return [who, s(' disabled two-factor authentication')];
    case 'user.invited': return [who, s(' invited a new member'), ...(meta.role ? [s(' as '), b(meta.role)] : [])];
    case 'user.role_changed': return [who, s(" changed a member's role to "), b(meta.role ?? '')];
    case 'user.deactivated': return [who, s(' deactivated a member')];
    case 'token.created': return [who, s(' created token '), b(meta.name ?? '')];
    case 'token.rotated': return [who, s(' rotated a token')];
    case 'token.revoked': return [who, s(' revoked a token')];
    case 'session.revoked': return [who, s(' signed out a session')];
    case 'webhook.created': return [who, s(' created webhook '), b(meta.name ?? '')];
    case 'webhook.rotated': return [who, s(' rotated a webhook token')];
    case 'webhook.deleted': return [who, s(' deleted a webhook')];
    default: return [who, s(` — ${e.action}`)];
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (isToday(d)) return `Today, ${time}`;
  if (isYesterday(d)) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    entries.value = await window.ipcRenderer.invoke(SEND.SERVER_AUDIT_LOG_LIST, {
      host: props.host, token: props.token, limit: 200,
    });
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to load audit log';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="space-y-3.5">
    <div v-if="error" class="text-sm text-destructive px-3 py-2 border border-destructive/30 rounded-md bg-destructive/5">
      {{ error }}
    </div>

    <div class="flex gap-1.5 flex-wrap">
      <button
        v-for="f in FILTERS"
        :key="f.key"
        class="text-xs px-3 py-1 rounded-full border transition-colors"
        :class="filter === f.key ? 'bg-foreground text-background border-transparent' : 'text-muted-foreground hover:text-foreground'"
        @click="filter = f.key"
      >
        {{ f.label }}
      </button>
    </div>

    <WsCard>
      <div v-if="loading" class="py-6 text-center text-sm text-muted-foreground">Loading…</div>
      <template v-else>
        <div v-for="e in filtered" :key="e.id" class="flex gap-3.5 px-4 py-3 border-b last:border-b-0">
          <div class="w-32 shrink-0 pt-px text-xs text-muted-foreground tabular-nums" :title="new Date(e.created_at).toLocaleString()">
            {{ formatTime(e.created_at) }}
          </div>
          <span
            class="h-6.5 w-6.5 rounded-full flex items-center justify-center shrink-0"
            :class="isBad(e.action) ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'"
          >
            <component :is="iconFor(e.action)" class="h-3.25 w-3.25" />
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-[13.5px]">
              <template v-for="(seg, i) in describe(e)" :key="i">
                <b v-if="seg.b" class="font-semibold">{{ seg.text }}</b>
                <template v-else>{{ seg.text }}</template>
              </template>
            </div>
            <div v-if="e.ip" class="mt-0.5 text-xs text-muted-foreground">{{ e.ip }}</div>
          </div>
        </div>
        <p v-if="filtered.length === 0" class="text-sm text-muted-foreground py-6 text-center">
          No activity recorded yet.
        </p>
      </template>
    </WsCard>
  </div>
</template>
