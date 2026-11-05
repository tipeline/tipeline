<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ShieldCheck, Copy, Check } from 'lucide-vue-next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { SEND } from '@/ipc-channels';
import WsCard from '@/components/workspace/ui/WsCard.vue';
import {
  btnClass,
  btnPrimaryClass,
  btnDangerClass,
  mutedBadgeClass,
} from '@/components/workspace/ui/styles';

const props = defineProps<{ host: string; token: string; isAdmin: boolean }>();

const SSO_PROVIDERS = [
  { name: 'Google Workspace', logo: 'G', protocol: 'OIDC' },
  { name: 'Microsoft Entra ID', logo: 'MS', protocol: 'OIDC' },
  { name: 'Okta', logo: 'OK', protocol: 'SAML 2.0' },
];

const mfaEnabled = ref(false);
const enrollment = ref<{ enabled: number; total: number } | null>(null);
const loading = ref(false);
const error = ref('');

const showEnrollModal = ref(false);
const enrollSecret = ref('');
const enrollUrl = ref('');
const enrollCode = ref('');
const enrollLoading = ref(false);
const enrollError = ref('');
const backupCodes = ref<string[] | null>(null);
const copiedSecret = ref(false);

const showDisableAlert = ref(false);
const disabling = ref(false);

async function serverCall(channel: string, args: Record<string, any> = {}) {
  return window.ipcRenderer.invoke(channel, { host: props.host, token: props.token, ...args });
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [status, agg] = await Promise.all([
      serverCall(SEND.SERVER_MFA_STATUS),
      props.isAdmin ? serverCall(SEND.SERVER_MFA_ENROLLMENT) : Promise.resolve(null),
    ]);
    mfaEnabled.value = status.enabled;
    enrollment.value = agg;
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to load security settings';
  } finally {
    loading.value = false;
  }
}

async function startEnroll() {
  enrollError.value = '';
  enrollCode.value = '';
  backupCodes.value = null;
  try {
    const result = await serverCall(SEND.SERVER_MFA_ENROLL);
    enrollSecret.value = result.secret;
    enrollUrl.value = result.otpauthUrl;
    showEnrollModal.value = true;
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to start enrollment';
  }
}

async function confirmEnroll() {
  if (!enrollCode.value.trim()) return;
  enrollLoading.value = true;
  enrollError.value = '';
  try {
    const result = await serverCall(SEND.SERVER_MFA_CONFIRM, { code: enrollCode.value.trim() });
    backupCodes.value = result.backupCodes;
    mfaEnabled.value = true;
    await load();
  } catch (e: any) {
    enrollError.value = e?.message ?? 'Invalid code';
  } finally {
    enrollLoading.value = false;
  }
}

async function confirmDisable() {
  disabling.value = true;
  try {
    await serverCall(SEND.SERVER_MFA_DISABLE);
    mfaEnabled.value = false;
    showDisableAlert.value = false;
    await load();
  } catch (e: any) {
    error.value = e?.message ?? 'Failed to disable 2FA';
  } finally {
    disabling.value = false;
  }
}

async function copySecret() {
  await navigator.clipboard.writeText(enrollSecret.value);
  copiedSecret.value = true;
  setTimeout(() => { copiedSecret.value = false; }, 2000);
}

function closeEnrollModal() {
  showEnrollModal.value = false;
  if (backupCodes.value) backupCodes.value = null;
}

onMounted(load);
</script>

<template>
  <div class="space-y-4">
    <div v-if="error" class="text-sm text-destructive px-3 py-2 border border-destructive/30 rounded-md bg-destructive/5">
      {{ error }}
    </div>

    <!-- Two-factor authentication -->
    <WsCard title="Two-factor authentication" description="Protect sign-ins with an authenticator app">
      <template #body>
        <div class="flex items-center justify-between gap-4 py-3 first:pt-0">
          <div class="flex items-start gap-2.5">
            <ShieldCheck class="h-4 w-4 mt-0.5 shrink-0" :class="mfaEnabled ? 'text-green-500' : 'text-muted-foreground'" />
            <div>
              <div class="text-[13.5px] font-medium">Your account</div>
              <div class="mt-0.5 text-xs text-muted-foreground">
                <template v-if="loading">Loading…</template>
                <template v-else-if="mfaEnabled">Enabled — a code is required at every sign-in</template>
                <template v-else>Not enabled — only a password is required</template>
              </div>
            </div>
          </div>
          <button v-if="!mfaEnabled" :class="btnPrimaryClass" :disabled="loading" @click="startEnroll">
            Enable 2FA
          </button>
          <button v-else :class="btnDangerClass" @click="showDisableAlert = true">Disable</button>
        </div>

        <div v-if="isAdmin && enrollment" class="border-t pt-3 pb-0.5">
          <div class="text-[13.5px] font-medium">Workspace enrollment</div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            {{ enrollment.enabled }} of {{ enrollment.total }} member{{ enrollment.total === 1 ? '' : 's' }} enrolled
          </div>
          <div class="mt-2 h-1.5 w-full max-w-56 rounded-full bg-muted overflow-hidden">
            <div
              class="h-full rounded-full bg-green-500"
              :style="{ width: `${enrollment.total ? (enrollment.enabled / enrollment.total) * 100 : 0}%` }"
            />
          </div>
        </div>
      </template>
    </WsCard>

    <!-- Single sign-on (placeholder — not implemented yet) -->
    <WsCard title="Single sign-on" description="Let members sign in with an identity provider">
      <template #body>
        <div class="flex flex-col gap-2.5">
          <div
            v-for="provider in SSO_PROVIDERS"
            :key="provider.name"
            class="flex items-center gap-3 rounded-lg border px-3.5 py-3"
          >
            <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold">
              {{ provider.logo }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[13.5px] font-medium">{{ provider.name }}</div>
              <div class="text-xs text-muted-foreground">{{ provider.protocol }}</div>
            </div>
            <span :class="mutedBadgeClass">Coming soon</span>
            <button :class="btnClass" disabled>Connect</button>
          </div>
        </div>
      </template>
    </WsCard>
  </div>

  <!-- Enroll modal -->
  <Dialog :open="showEnrollModal" @update:open="(v) => !v && closeEnrollModal()">
    <DialogContent class="max-w-sm">
      <DialogHeader>
        <DialogTitle>{{ backupCodes ? 'Save your backup codes' : 'Enable two-factor authentication' }}</DialogTitle>
      </DialogHeader>

      <div v-if="!backupCodes" class="space-y-3 py-2">
        <p class="text-sm text-muted-foreground">
          Add this account to your authenticator app, then enter the 6-digit code it shows.
        </p>
        <div class="space-y-1">
          <label class="text-xs font-medium text-muted-foreground">Secret key</label>
          <div class="flex items-center gap-2">
            <code class="flex-1 text-xs font-mono bg-muted px-2 py-1.5 rounded break-all">{{ enrollSecret }}</code>
            <button class="p-1.5 rounded hover:bg-accent transition-colors shrink-0" @click="copySecret">
              <Check v-if="copiedSecret" class="h-4 w-4 text-green-600" />
              <Copy v-else class="h-4 w-4" />
            </button>
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">Verification code</label>
          <input
            v-model="enrollCode"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="000000"
            class="w-full px-3 py-2 text-sm border rounded-md bg-background font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
            @keyup.enter="confirmEnroll"
          />
        </div>
        <p v-if="enrollError" class="text-sm text-destructive">{{ enrollError }}</p>
      </div>

      <div v-else class="space-y-3 py-2">
        <p class="text-sm text-muted-foreground">
          Store these somewhere safe. Each code can be used once if you lose access to your authenticator app.
        </p>
        <div class="grid grid-cols-2 gap-1.5 font-mono text-sm bg-muted rounded-md p-3">
          <div v-for="code in backupCodes" :key="code">{{ code }}</div>
        </div>
      </div>

      <DialogFooter>
        <button
          v-if="!backupCodes"
          class="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
          :disabled="enrollLoading"
          @click="showEnrollModal = false"
        >
          Cancel
        </button>
        <button
          v-if="!backupCodes"
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          :disabled="enrollLoading"
          @click="confirmEnroll"
        >
          {{ enrollLoading ? 'Verifying…' : 'Verify & enable' }}
        </button>
        <button
          v-else
          class="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          @click="closeEnrollModal"
        >
          Done
        </button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <!-- Disable confirmation -->
  <AlertDialog v-model:open="showDisableAlert">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Disable two-factor authentication?</AlertDialogTitle>
        <AlertDialogDescription>
          Your account will only require a password to sign in.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel :disabled="disabling">Cancel</AlertDialogCancel>
        <AlertDialogAction :disabled="disabling" @click="confirmDisable">Disable</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
