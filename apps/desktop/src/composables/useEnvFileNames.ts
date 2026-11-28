import { readonly, ref, type Ref } from 'vue';

// The names ~/.tipeline/.env sets (Settings → Environment), for the `_env` folder in a
// workflow field's `{}` menu and `{{` autocomplete. Names only: values stay in the main
// process (electron/main/utils/envFile.ts). One copy for every field, read again when the
// window comes back into focus, since the file is edited in another app.
const names = ref<string[]>([]);
let started = false;

async function load() {
  try {
    const info = await window.ipcRenderer?.invoke('app:env-file:info');
    names.value = Array.isArray(info?.names) ? info.names : [];
  } catch {
    names.value = [];
  }
}

export function useEnvFileNames(): Readonly<Ref<readonly string[]>> {
  if (!started && typeof window !== 'undefined' && window.ipcRenderer) {
    started = true;
    void load();
    window.addEventListener('focus', () => void load());
  }
  return readonly(names);
}
