<script lang="ts">
/** Settings key: 'true' once the welcome screen has been finished on this Core. */
export const WELCOME_DONE_KEY = 'welcomeCompleted';
</script>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Globe } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSettingsStore } from '@/store/settingsStore';
import { SEND } from '@/ipc-channels';
import {
  LOCALE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  detectSystemLocale,
  previewLocale,
  useLocale,
  type SupportedLocale,
} from '@/composables/useLocale';
import { DEFAULT_PLATFORM_CURRENT_KEY } from '@/composables/useNewItemDefaults';

// Shown once, over the app, the first time Tipeline opens: the one thing to choose is the
// language. Everything else has a default and lives in Settings: the platform is this
// computer's, the theme follows the system, and the author is the OS account's name until the
// first workflow or app saves the name it was made with (useNewItemDefaults).
const { t } = useI18n({ useScope: 'global' });
const { setLocale } = useLocale();
const settingsStore = useSettingsStore();

// A language chosen before (Settings, or a welcome shown again) wins over the system's.
function startingLocale(): SupportedLocale {
  const saved = settingsStore.get('language') || localStorage.getItem(LOCALE_STORAGE_KEY) || '';
  const known = SUPPORTED_LANGUAGES.find((l) => l.value === saved);
  return known ? known.value : detectSystemLocale();
}

const language = ref<SupportedLocale>(startingLocale());
previewLocale(language.value);

const saving = ref(false);
const failed = ref(false);

// The Desktop app's version, as Settings → About shows it.
const version = ref('');

onMounted(() => {
  window.ipcRenderer
    ?.invoke(SEND.APP_VERSION)
    .then((v: unknown) => (version.value = typeof v === 'string' ? v : ''))
    .catch(() => {});
});

function pickLanguage(value: unknown) {
  const known = SUPPORTED_LANGUAGES.find((l) => l.value === value);
  if (!known) return;
  language.value = known.value;
  previewLocale(known.value);
}

async function start() {
  if (saving.value) return;
  saving.value = true;
  failed.value = false;
  try {
    await setLocale(language.value);
    // New workflows get this computer's platform unless that was turned off in Settings before.
    if (!settingsStore.get(DEFAULT_PLATFORM_CURRENT_KEY)) {
      await settingsStore.set(DEFAULT_PLATFORM_CURRENT_KEY, 'true');
    }
    // Last: this is what closes the screen.
    await settingsStore.set(WELCOME_DONE_KEY, 'true');
  } catch {
    failed.value = true;
    saving.value = false;
  }
}
</script>

<template>
  <div
    class="welcome fixed inset-0 z-50 flex flex-col bg-background text-foreground"
    role="dialog"
    aria-modal="true"
    aria-labelledby="welcome-title"
    data-testid="welcome"
  >
    <form
      class="flex-1 flex flex-col items-center justify-center gap-7 px-4"
      @submit.prevent="start"
    >
      <svg
        width="100"
        height="80"
        viewBox="0 0 100 80"
        fill="none"
        aria-hidden="true"
        class="welcome-in text-foreground"
      >
        <rect width="100" height="22" rx="6" fill="currentColor" />
        <rect x="22" y="29" width="56" height="22" rx="6" fill="currentColor" />
        <rect x="31" y="58" width="38" height="22" rx="6" fill="currentColor" />
      </svg>

      <div class="welcome-in flex flex-col items-center gap-2.5 text-center" style="--delay: 120ms">
        <h1 id="welcome-title" class="m-0 text-3xl font-semibold tracking-tight">
          {{ t('welcome.title') }}
        </h1>
        <p class="m-0 max-w-md text-base text-muted-foreground leading-relaxed">
          {{ t('welcome.subtitle') }}
        </p>
      </div>

      <div class="welcome-in w-full max-w-sm flex flex-col gap-2" style="--delay: 240ms">
        <label id="welcome-language-label" for="welcome-language" class="text-sm font-medium">
          {{ t('welcome.language') }}
        </label>
        <Select :model-value="language" @update:model-value="pickLanguage">
          <SelectTrigger
            id="welcome-language"
            class="h-11 w-full text-[15px]"
            aria-labelledby="welcome-language-label"
            data-testid="welcome-language"
          >
            <span class="flex items-center gap-2">
              <Globe class="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="lang in SUPPORTED_LANGUAGES" :key="lang.value" :value="lang.value">
              {{ lang.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="welcome-in w-full max-w-sm flex flex-col gap-2" style="--delay: 360ms">
        <Button type="submit" class="h-11 w-full text-[15px]" :disabled="saving" autofocus>
          {{ t('welcome.start') }}
        </Button>
        <p v-if="failed" class="m-0 text-[13px] text-destructive" role="alert">
          {{ t('welcome.saveFailed') }}
        </p>
        <p v-else class="m-0 text-[13px] text-muted-foreground text-center">{{ t('welcome.later') }}</p>
      </div>
    </form>

    <div class="welcome-in flex justify-end px-7 py-5" style="--delay: 480ms">
      <span v-if="version" class="text-[13px] text-muted-foreground tabular-nums" data-testid="welcome-version">
        {{ t('welcome.version', { version }) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* The loader has just faded out on the logo; the logo comes back where it was and the rest
   rises in after it, one piece at a time. */
.welcome-in {
  animation: welcome-in 500ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--delay, 0ms);
}

@keyframes welcome-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .welcome-in {
    animation-duration: 1ms;
    animation-delay: 0ms;
  }
}
</style>
