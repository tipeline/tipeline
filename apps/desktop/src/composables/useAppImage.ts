import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { imageSource, withVersion } from '@/utils/appImage';

// One image's URL for an <img>, from an app's `src` (see appImage): a web URL, a data
// URL, bare base64 — or the path of a file a workflow wrote. In the desktop app a file is
// read by the main process (as a PDF viewer's is): one rule for all — inside ~/Tipeline,
// or anywhere for an app the user trusts or a file they picked — and shown from a blob.
// `version` changing reads it again (a workflow rewrote the same file). Used by the
// Image component and by each picture of a Gallery.

/** The blob's type: browsers guess PNG / JPEG from the bytes, but show SVG only when told. */
export function imageBlobType(path: string, bytes: Uint8Array): string {
  if (/\.svg$/i.test(path)) return 'image/svg+xml';
  const head = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart();
  return /^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(head) ? 'image/svg+xml' : '';
}

export function useAppImage(
  src: () => unknown,
  options: { version: Ref<number>; editable: () => boolean | undefined; appIdentifier: () => string | undefined }
) {
  const source = computed(() => imageSource(src()));
  const viaMain = computed(() => source.value.kind === 'file' && !!window.ipcRenderer && !options.editable());
  const fileUrl = ref<string | null>(null);
  const fileError = ref<string | null>(null);

  // Keyed on the text of `src` (not the rebuilt `source` object).
  watch(
    [() => String(src() ?? ''), options.version, viaMain],
    async () => {
      if (fileUrl.value) URL.revokeObjectURL(fileUrl.value);
      fileUrl.value = null;
      fileError.value = null;
      if (!viaMain.value) return;
      const path = String(src()).trim();
      const result = await window.ipcRenderer.invoke('app:read-file', { path, appIdentifier: options.appIdentifier() });
      if (result?.ok) {
        const bytes = result.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result.bytes);
        fileUrl.value = URL.createObjectURL(new Blob([bytes], { type: imageBlobType(path, bytes) }));
      } else fileError.value = result?.error ?? 'notFound';
    },
    { immediate: true }
  );
  onBeforeUnmount(() => fileUrl.value && URL.revokeObjectURL(fileUrl.value));

  const url = computed(() => (viaMain.value ? fileUrl.value : withVersion(source.value, options.version.value)));
  return { source, viaMain, url, fileError };
}
