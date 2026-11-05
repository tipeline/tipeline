// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import FileDropWidget from '@/components/app/widgets/FileDropWidget.vue';
import { accepts, addFiles, filesValue, formatBytes, type DroppedFile } from '@/utils/appFiles';

const f = (name: string, size = 100, type = ''): DroppedFile => ({ name, path: `/in/${name}`, size, type });

describe('appFiles', () => {
  it('accept: extensions (with or without dot), mime wildcards and exact types', () => {
    expect(accepts(f('a.PDF'), '.pdf, .png')).toBe(true);
    expect(accepts(f('a.txt'), '.pdf, .png')).toBe(false);
    expect(accepts(f('a.csv'), ['csv'])).toBe(true);
    expect(accepts(f('p.jpg', 1, 'image/jpeg'), 'image/*')).toBe(true);
    expect(accepts(f('p.json', 1, 'application/json'), 'application/json')).toBe(true);
    expect(accepts(f('anything'), '')).toBe(true);
  });

  it('turns files down by kind, size, count and repeats — and keeps the rest', () => {
    const big = f('big.pdf', 3 * 1024 * 1024);
    const r = addFiles([f('one.pdf')], [f('two.pdf'), f('x.exe'), big, f('one.pdf'), f('three.pdf')], {
      accept: '.pdf',
      maxSizeMb: 2,
      maxFiles: 2,
    });
    expect(r.files.map((x) => x.name)).toEqual(['one.pdf', 'two.pdf']);
    expect(r.rejected).toEqual([
      { name: 'x.exe', reason: 'type' },
      { name: 'big.pdf', reason: 'size' },
      { name: 'one.pdf', reason: 'duplicate' },
      { name: 'three.pdf', reason: 'count' },
    ]);
    expect(addFiles([], [{ ...f('web.png'), path: '' }], {}).rejected).toEqual([{ name: 'web.png', reason: 'noPath' }]);
  });

  it('one file (multiple: false): the newest good one replaces it; a bad one keeps it', () => {
    expect(addFiles([f('old.txt')], [f('new.txt')], { multiple: false }).files.map((x) => x.name)).toEqual(['new.txt']);
    expect(addFiles([f('old.txt')], [f('bad.exe')], { multiple: false, accept: '.txt' }).files.map((x) => x.name)).toEqual(['old.txt']);
  });

  it('value and sizes', () => {
    expect(filesValue([f('a'), f('b')], undefined)).toEqual(['/in/a', '/in/b']);
    expect(filesValue([f('a')], false)).toBe('/in/a');
    expect(filesValue([], false)).toBeNull();
    expect([formatBytes(820), formatBytes(12_700), formatBytes(3_250_000)]).toEqual(['820 B', '12 KB', '3.1 MB']);
  });
});

describe('FileDropWidget', () => {
  const mountDrop = (props: Record<string, unknown>, files: DroppedFile[] = []) =>
    mount(FileDropWidget, { props: { props, state: { files }, componentId: 'docs' }, global: { plugins: [i18n] } });
  const drop = (w: ReturnType<typeof mountDrop>, list: File[]) =>
    w.find('[data-testid="dropzone"]').trigger('drop', { dataTransfer: { files: list } });

  it('a drop publishes the files and their paths, and fires change', async () => {
    const w = mountDrop({ accept: '.txt' });
    await drop(w, [new File(['hello'], 'a.txt', { type: 'text/plain' }), new File(['x'], 'b.exe')]);
    const files = [{ name: 'a.txt', path: 'a.txt', size: 5, type: 'text/plain' }];
    expect(w.emitted('state')![0]).toEqual([{ files, value: ['a.txt'], error: null }]);
    expect(w.emitted('event')![0]).toEqual(['change', { value: ['a.txt'], files }]);
    expect(w.find('[data-testid="rejected"]').text()).toContain('b.exe');
  });

  it('lists the files kept, removes one, and shows the limits', async () => {
    const w = mountDrop({ maxSizeMb: 5, maxFiles: 3 }, [f('a.pdf', 2048), f('b.pdf')]);
    expect(w.text()).toContain('a.pdf');
    expect(w.text()).toContain('2.0 KB');
    expect(w.text()).toContain('up to 5 MB each');
    expect(w.text()).toContain('at most 3 files');
    await w.findAll('button[aria-label="Remove"]')[0].trigger('click');
    expect(w.emitted('state')![0][0]).toMatchObject({ value: ['/in/b.pdf'] });
  });
});
