<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Shield, PenLine, Eye, Check } from 'lucide-vue-next';
import WsNote from '@/components/workspace/ui/WsNote.vue';
import { SEND } from '@/ipc-channels';

const props = defineProps<{ host: string; token: string }>();

interface ServerUser { id: string; role: string; is_active: number }

const users = ref<ServerUser[]>([]);
const loading = ref(false);

const ROLES = [
  {
    key: 'admin',
    label: 'Admin',
    icon: Shield,
    iconClass: 'text-amber-500',
    groups: [
      { label: 'Workflows', perms: [{ name: 'View, run, edit, delete', on: true }] },
      {
        label: 'Workspace',
        perms: [
          { name: 'Manage members & roles', on: true },
          { name: 'Manage tokens & webhooks', on: true },
          { name: 'View audit log', on: true },
          { name: 'Manage security (MFA)', on: true },
        ],
      },
    ],
  },
  {
    key: 'editor',
    label: 'Editor',
    icon: PenLine,
    iconClass: 'text-blue-500',
    groups: [
      { label: 'Workflows', perms: [{ name: 'View, run, edit', on: true }, { name: 'Delete', on: false }] },
      {
        label: 'Workspace',
        perms: [
          { name: 'Manage own tokens', on: true },
          { name: 'Manage members, roles, or webhooks', on: false },
          { name: 'View audit log', on: false },
        ],
      },
    ],
  },
  {
    key: 'viewer',
    label: 'Viewer',
    icon: Eye,
    iconClass: 'text-muted-foreground',
    groups: [
      { label: 'Workflows', perms: [{ name: 'View only', on: true }, { name: 'Run, edit, delete', on: false }] },
      {
        label: 'Workspace',
        perms: [{ name: 'Manage members, tokens, or webhooks', on: false }, { name: 'View audit log', on: false }],
      },
    ],
  },
] as const;

async function load() {
  loading.value = true;
  try {
    users.value = await window.ipcRenderer.invoke(SEND.SERVER_USERS_LIST, { host: props.host, token: props.token });
  } finally {
    loading.value = false;
  }
}

function countFor(role: string): number {
  return users.value.filter((u) => u.role === role && u.is_active).length;
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <WsNote>
      Assign roles from the Users tab. <b>Custom roles</b> with per-area permission editing ship in a later update.
    </WsNote>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
      <div v-for="role in ROLES" :key="role.key" class="rounded-lg border bg-card p-4">
        <div class="flex items-center gap-2 mb-1">
          <component :is="role.icon" class="h-4 w-4" :class="role.iconClass" />
          <h3 class="text-[14.5px] font-semibold">{{ role.label }}</h3>
        </div>
        <div class="text-xs text-muted-foreground mb-3.5">
          {{ loading ? '…' : countFor(role.key) }} member{{ countFor(role.key) === 1 ? '' : 's' }}
        </div>
        <div v-for="group in role.groups" :key="group.label" class="mb-3 last:mb-0">
          <div class="text-[11px] text-muted-foreground uppercase tracking-wide mb-1.5">{{ group.label }}</div>
          <div
            v-for="perm in group.perms"
            :key="perm.name"
            class="flex items-center gap-2 py-0.75 text-[13px]"
            :class="{ 'text-muted-foreground': !perm.on }"
          >
            <span
              class="h-3.75 w-3.75 rounded shrink-0 flex items-center justify-center border"
              :class="perm.on ? 'bg-primary border-primary text-primary-foreground' : ''"
            >
              <Check v-if="perm.on" class="h-2.5 w-2.5" :stroke-width="3" />
            </span>
            {{ perm.name }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
