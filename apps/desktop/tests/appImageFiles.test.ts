// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import ImageWidget from '@/components/app/widgets/ImageWidget.vue';
import { APP_RUNTIME } from '@/components/app/appRuntimeKey';
import { loadPdfBytes, pdfSource } from '@/utils/appPdf';

const runtime = { appIdentifier: () => 'app-7', pageId: () => 'p', runnables: {} };
afterEach(() => {
  delete (window as any).ipcRenderer;
});

describe('Image files go through the main process with the app asking', () => {
  it('shows the bytes it gets back', async () => {
    const invoke = vi.fn(async () => ({ ok: true, bytes: new Uint8Array([137, 80, 78, 71]) }));
    (window as any).ipcRenderer = { invoke };
    URL.createObjectURL = vi.fn(() => 'blob:image-1');
    URL.revokeObjectURL = vi.fn();
    const w = mount(ImageWidget, {
      props: { props: { src: '~/Downloads/photo.png' } },
      global: { plugins: [i18n], provide: { [APP_RUNTIME as symbol]: runtime } },
    });
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith('app:read-file', { path: '~/Downloads/photo.png', appIdentifier: 'app-7' });
    expect(w.find('img').attributes('src')).toBe('blob:image-1');
  });

  it('a refused file says it is outside ~/Tipeline and where to allow it', async () => {
    (window as any).ipcRenderer = { invoke: vi.fn(async () => ({ ok: false, error: 'outsideTipeline' })) };
    const w = mount(ImageWidget, {
      props: { props: { src: '/Users/ana/Downloads/photo.png' } },
      global: { plugins: [i18n], provide: { [APP_RUNTIME as symbol]: runtime } },
    });
    await flushPromises();
    expect(w.find('[data-testid="image-error"]').text()).toContain('outside ~/Tipeline');
    expect(w.find('[data-testid="image-error"]').text()).toContain('File access');
  });
});

describe('PDF files carry the app asking', () => {
  it('passes the app identifier to the main process', async () => {
    const invoke = vi.fn(async () => ({ ok: true, bytes: new Uint8Array([37]) }));
    (window as any).ipcRenderer = { invoke };
    await loadPdfBytes(pdfSource('~/Downloads/a.pdf'), 0, 'app-7');
    expect(invoke).toHaveBeenCalledWith('app:read-file', { path: '~/Downloads/a.pdf', appIdentifier: 'app-7' });
  });
});
