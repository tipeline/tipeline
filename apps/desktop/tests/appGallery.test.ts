// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n } from '@/i18n';
import GalleryWidget from '@/components/app/widgets/GalleryWidget.vue';
import { APP_RUNTIME } from '@/components/app/appRuntimeKey';
import { galleryItems, wrapIndex } from '@/utils/appGallery';
import { imageBlobType } from '@/composables/useAppImage';

const PHOTOS = [
  { id: 1, url: 'https://example.org/a.jpg', title: 'Beach' },
  { id: 2, url: 'https://example.org/b.jpg', title: 'Forest' },
  { id: 3, url: 'https://example.org/c.jpg', title: 'City' },
];

describe('galleryItems', () => {
  it('rows by the usual keys, given keys, or plain srcs', () => {
    expect(galleryItems(PHOTOS).map((i) => [i.src, i.caption])).toEqual([
      ['https://example.org/a.jpg', 'Beach'],
      ['https://example.org/b.jpg', 'Forest'],
      ['https://example.org/c.jpg', 'City'],
    ]);
    expect(galleryItems([{ pic: 'x.png', note: 'X' }], { srcKey: 'pic', captionKey: 'note' })[0]).toMatchObject({ src: 'x.png', caption: 'X' });
    expect(galleryItems(['a.png', null, 'b.png']).map((i) => i.src)).toEqual(['a.png', 'b.png']);
  });

  it('wraps around both ways', () => {
    expect([wrapIndex(3, 3), wrapIndex(-1, 3), wrapIndex(1, 0)]).toEqual([0, 2, 0]);
  });

  it('a file’s blob says SVG when it is one (browsers show SVG only when told)', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(imageBlobType('out/chart.svg', enc('<svg/>'))).toBe('image/svg+xml');
    expect(imageBlobType('out/chart', enc('<?xml version="1.0"?>\n<svg xmlns="x">'))).toBe('image/svg+xml');
    expect(imageBlobType('out/photo.png', new Uint8Array([137, 80, 78, 71]))).toBe('');
  });
});

describe('GalleryWidget', () => {
  afterEach(() => {
    delete (window as any).ipcRenderer;
    vi.useRealTimers();
  });
  const mountGallery = (props: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    mount(GalleryWidget, {
      props: { props, componentId: 'photos', ...extra },
      global: { plugins: [i18n], provide: { [APP_RUNTIME as symbol]: { appIdentifier: () => 'app-1' } } },
      attachTo: document.body,
    });

  it('a grid of thumbnails with captions, in the columns asked for', () => {
    const w = mountGallery({ data: PHOTOS, columns: 2 });
    expect(w.get('[data-testid="gallery-grid"]').attributes('style')).toContain('repeat(2, minmax(0, 1fr))');
    expect(w.findAll('img').map((i) => i.attributes('src'))).toEqual(PHOTOS.map((p) => p.url));
    expect(w.findAll('figcaption').map((c) => c.text())).toEqual(['Beach', 'Forest', 'City']);
    w.unmount();
  });

  it('a click selects the picture and, zoomable, opens it big with previous / next', async () => {
    const w = mountGallery({ data: PHOTOS, zoomable: true });
    await w.findAll('button[data-item]')[2].trigger('click');
    expect(w.emitted('event')?.at(-1)).toEqual(['itemClick', { selectedItem: PHOTOS[2], selectedIndex: 2 }]);
    await nextTick();
    const caption = () => document.querySelector('[data-testid="lightbox-caption"]')?.textContent?.replace(/\s+/g, ' ').trim();
    expect(caption()).toBe('City · 3 / 3');
    (document.querySelector('[data-testid="lightbox-next"]') as HTMLElement).click();
    await nextTick();
    expect(caption()).toBe('Beach · 1 / 3'); // round to the first
    w.unmount();
  });

  it('without zoomable a click only selects', async () => {
    const w = mountGallery({ data: PHOTOS });
    await w.findAll('button[data-item]')[0].trigger('click');
    await nextTick();
    expect(document.querySelector('[data-testid="lightbox-caption"]')).toBeNull();
    w.unmount();
  });

  it('a carousel: one at a time, arrows and dots, index and change', async () => {
    const w = mountGallery({ data: PHOTOS, display: 'carousel' });
    expect(w.findAll('img')).toHaveLength(1);
    expect(w.get('[data-testid="carousel-caption"]').text()).toBe('Beach');
    await w.get('[data-testid="carousel-prev"]').trigger('click');
    expect(w.get('[data-testid="carousel-caption"]').text()).toBe('City');
    expect(w.emitted('event')?.at(-1)).toEqual(['change', { index: 2 }]);
    await w.findAll('[role="tab"]')[1].trigger('click');
    expect(w.get('img').attributes('src')).toBe(PHOTOS[1].url);
    expect(w.emitted('state')?.at(-1)).toEqual([{ index: 1 }]);
    w.unmount();
  });

  it('autoplay turns it, paused while the pointer is on it', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const w = mountGallery({ data: PHOTOS, display: 'carousel', autoplay: 2 });
    vi.advanceTimersByTime(2000);
    await nextTick();
    expect(w.get('[data-testid="carousel-caption"]').text()).toBe('Forest');
    await w.get('[data-testid="gallery-carousel"]').trigger('mouseenter');
    vi.advanceTimersByTime(6000);
    await nextTick();
    expect(w.get('[data-testid="carousel-caption"]').text()).toBe('Forest');
    w.unmount();
  });

  it('files load like an Image’s: through the main process, as this app', async () => {
    const invoke = vi.fn(async () => ({ ok: true, bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>') }));
    (window as any).ipcRenderer = { invoke };
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (blobs.push(b), `blob:${blobs.length}`));
    URL.revokeObjectURL = vi.fn();
    const w = mountGallery({ data: [{ path: 'output/card-1.svg', caption: 'One' }] });
    await flushPromises();
    expect(invoke).toHaveBeenCalledWith('app:read-file', { path: 'output/card-1.svg', appIdentifier: 'app-1' });
    expect(w.get('img').attributes('src')).toBe('blob:1');
    expect(blobs[0].type).toBe('image/svg+xml');
    w.unmount();
  });

  it('a missing picture shows a placeholder; the builder shows drawn samples', () => {
    const w = mountGallery({ data: [{ caption: 'no src' }] });
    expect(w.find('[data-testid="gallery-missing"]').exists()).toBe(true);
    w.unmount();
    const b = mountGallery({ data: '{= runnables.p.outputs.photos =}' }, { editable: true });
    expect(b.findAll('img')).toHaveLength(6);
    expect(b.get('img').attributes('src')).toMatch(/^data:image\/svg\+xml;base64,/);
    b.unmount();
  });
});
