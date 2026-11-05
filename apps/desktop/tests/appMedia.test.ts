// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableJavaScriptFileLoading":true}}
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import nodePath from 'node:path';
import { mount } from '@vue/test-utils';
import { i18n } from '@/i18n';
import MediaWidget from '@/components/app/widgets/MediaWidget.vue';
import { APP_RUNTIME } from '@/components/app/appRuntimeKey';
import { clock, mediaFileUrl, mediaKind, mediaSource } from '@/utils/appMedia';
import { byteRange, mediaResponse, playableMediaFile } from '../electron/main/utils/appMedia';

// A fake home with ~/Tipeline/output/clip.mp3 (10 bytes), a text file, and a file outside.
const HOME = fs.mkdtempSync(nodePath.join(os.tmpdir(), 'tipeline-media-'));
fs.mkdirSync(nodePath.join(HOME, 'Tipeline', 'output'), { recursive: true });
fs.writeFileSync(nodePath.join(HOME, 'Tipeline', 'output', 'clip.mp3'), '0123456789');
fs.writeFileSync(nodePath.join(HOME, 'Tipeline', 'output', 'notes.txt'), 'secret');
fs.writeFileSync(nodePath.join(HOME, 'outside.mp4'), 'abc');
afterAll(() => fs.rmSync(HOME, { recursive: true, force: true }));

const nobody = () => false;
const url = (path: string, app = 'app-1') => `tipeline-media://play?${new URLSearchParams({ path, app })}`;

describe('media files (main process)', () => {
  it('plays media inside ~/Tipeline; refuses other files, and files outside unless allowed', () => {
    expect(playableMediaFile('output/clip.mp3', HOME, nobody)).toMatchObject({ ok: true, type: 'audio/mpeg' });
    expect(playableMediaFile('output/notes.txt', HOME, nobody)).toEqual({ ok: false, error: 'notMedia' });
    expect(playableMediaFile('~/outside.mp4', HOME, nobody)).toEqual({ ok: false, error: 'outsideTipeline' });
    expect(playableMediaFile('~/outside.mp4', HOME, () => true)).toMatchObject({ ok: true, type: 'video/mp4' });
    expect(playableMediaFile('output/missing.mp3', HOME, nobody)).toEqual({ ok: false, error: 'notFound' });
  });

  it('byte ranges: start-end, open end, last N; invalid ones', () => {
    expect(byteRange(null, 10)).toBeNull();
    expect(byteRange('bytes=2-5', 10)).toEqual([2, 5]);
    expect(byteRange('bytes=7-', 10)).toEqual([7, 9]);
    expect(byteRange('bytes=-3', 10)).toEqual([7, 9]);
    expect(byteRange('bytes=4-99', 10)).toEqual([4, 9]);
    for (const bad of ['bytes=12-', 'bytes=5-2', 'items=0-1', 'bytes=-']) expect(byteRange(bad, 10)).toBe('invalid');
  });

  it('answers the whole file, or the part asked for (so players can seek)', async () => {
    const whole = mediaResponse(url('output/clip.mp3'), null, HOME, nobody);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    expect(await whole.text()).toBe('0123456789');

    const part = mediaResponse(url('output/clip.mp3'), 'bytes=3-6', HOME, nobody);
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 3-6/10');
    expect(await part.text()).toBe('3456');

    expect(mediaResponse(url('output/clip.mp3'), 'bytes=20-', HOME, nobody).status).toBe(416);
  });

  it('the app named in the link decides file access outside ~/Tipeline', () => {
    const trusted = (app: string) => app === 'trusted-app';
    expect(mediaResponse(url('~/outside.mp4', 'other-app'), null, HOME, trusted).status).toBe(403);
    expect(mediaResponse(url('~/outside.mp4', 'trusted-app'), null, HOME, trusted).status).toBe(200);
    expect(mediaResponse(url('output/notes.txt'), null, HOME, () => true).status).toBe(403); // never non-media
  });
});

describe('media sources (renderer)', () => {
  it('web links, data URLs and paths; other schemes refused — tipeline-media too', () => {
    expect(mediaSource('https://x.org/a.mp4')).toEqual({ kind: 'url', url: 'https://x.org/a.mp4' });
    expect(mediaSource('data:audio/wav;base64,AAAA').kind).toBe('data');
    expect(mediaSource('output/clip.mp3')).toEqual({ kind: 'file', path: 'output/clip.mp3' });
    for (const bad of ['tipeline-media://play?path=/etc&app=x', 'file:///a.mp4', 'javascript:1', 'data:text/html;base64,AA'])
      expect(mediaSource(bad).kind).toBe('invalid');
  });

  it('video or audio by type, unless kind says', () => {
    expect(mediaKind(mediaSource('a/b/song.MP3'))).toBe('audio');
    expect(mediaKind(mediaSource('https://x.org/v.webm?x=1'))).toBe('video');
    expect(mediaKind(mediaSource('data:audio/wav;base64,AA'))).toBe('audio');
    expect(mediaKind(mediaSource('stream'), 'audio')).toBe('audio');
  });

  it('builds the stream link with the app; clock times', () => {
    expect(mediaFileUrl('output/a b.mp3', 'app-1', 2)).toBe('tipeline-media://play?path=output%2Fa+b.mp3&app=app-1&v=2');
    expect([clock(65), clock(3723), clock(NaN)]).toEqual(['1:05', '1:02:03', '0:00']);
  });
});

describe('MediaWidget', () => {
  afterEach(() => {
    delete (window as any).ipcRenderer;
  });
  const mountMedia = (props: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    mount(MediaWidget, {
      props: { props, componentId: 'player', ...extra },
      global: { plugins: [i18n], provide: { [APP_RUNTIME as symbol]: { appIdentifier: () => 'app-1' } } },
    });

  it('a file: checked first, then streamed with this app’s identity', async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    (window as any).ipcRenderer = { invoke };
    const w = mountMedia({ src: 'output/clip.mp3' });
    await vi.waitFor(() => expect(w.find('audio').exists()).toBe(true));
    expect(invoke).toHaveBeenCalledWith('app:media-check', { path: 'output/clip.mp3', appIdentifier: 'app-1' });
    expect(w.get('audio').attributes('src')).toBe('tipeline-media://play?path=output%2Fclip.mp3&app=app-1');
    w.unmount();
  });

  it('says why a file won’t play', async () => {
    (window as any).ipcRenderer = { invoke: vi.fn(async () => ({ ok: false, error: 'outsideTipeline' })) };
    const w = mountMedia({ src: '/Users/ana/movie.mp4' });
    await vi.waitFor(() => expect(w.find('[data-testid="media-error"]').exists()).toBe(true));
    expect(w.get('[data-testid="media-error"]').text()).toContain('File access');
    expect(w.find('video').exists()).toBe(false);
    w.unmount();
  });

  it('an app can’t hand in its own stream link', () => {
    const w = mountMedia({ src: 'tipeline-media://play?path=%2Fetc%2Fx.mp4&app=trusted' });
    expect(w.find('video').exists()).toBe(false);
    expect(w.get('[data-testid="media-error"]').text()).toContain('Only web links');
    w.unmount();
  });

  it('a web video plays with its settings, and reports play / pause / end', async () => {
    const w = mountMedia({ src: 'https://example.org/clip.mp4', loop: true, muted: true, title: 'Demo' });
    const video = w.get('video');
    expect(video.attributes()).toMatchObject({ src: 'https://example.org/clip.mp4', controls: '', loop: '' });
    await video.trigger('play');
    await video.trigger('ended');
    expect(w.emitted('event')).toEqual([['play'], ['ended']]);
    expect(w.emitted('state')?.at(-1)).toEqual([{ playing: false, ended: true }]);
    w.unmount();
  });

  it('a newly loaded file starts over: its time, not the last one’s', async () => {
    const w = mountMedia({ src: 'https://example.org/a.mp3' });
    const audio = w.get('audio');
    Object.defineProperty(audio.element, 'duration', { value: 2.4, configurable: true });
    await audio.trigger('loadedmetadata');
    expect(w.emitted('state')?.at(-1)).toEqual([{ duration: 2.4, currentTime: 0, playing: false, ended: false }]);
    w.unmount();
  });

  it('a failed file is tried once more; then the reason, with Try again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    (window as any).ipcRenderer = { invoke: vi.fn(async () => ({ ok: true })) };
    const w = mountMedia({ src: 'output/clip.mp3' });
    await vi.waitFor(() => expect(w.find('audio').exists()).toBe(true));
    const fail = async (code: number) => {
      const el = w.get('audio').element as HTMLMediaElement;
      Object.defineProperty(el, 'error', { value: { code, message: 'x' }, configurable: true });
      el.dispatchEvent(new Event('error'));
      await vi.advanceTimersByTimeAsync(600);
    };
    await fail(3);
    expect(w.find('[data-testid="media-error"]').exists()).toBe(false); // retried quietly
    expect(w.get('audio').attributes('src')).toContain('&v=1');
    await fail(3);
    expect(w.get('[data-testid="media-error"]').text()).toContain('still being written');
    await w.get('[data-testid="media-retry"]').trigger('click');
    expect(w.get('audio').attributes('src')).toContain('&v=2');
    vi.useRealTimers();
    w.unmount();
  });

  it('an error from a player already replaced doesn’t count', async () => {
    const w = mountMedia({ src: 'https://example.org/a.mp3' });
    const old = w.get('audio').element;
    await w.setProps({ props: { src: 'https://example.org/b.mp3' } });
    Object.defineProperty(old, 'error', { value: { code: 2 }, configurable: true });
    old.dispatchEvent(new Event('error'));
    await w.vm.$nextTick();
    expect(w.find('[data-testid="media-error"]').exists()).toBe(false);
    w.unmount();
  });

  it('in the builder: nothing plays and nothing is reported', async () => {
    const w = mountMedia({ src: 'https://example.org/clip.mp4', autoplay: true }, { editable: true });
    expect(w.get('video').attributes('autoplay')).toBeUndefined();
    await w.get('video').trigger('play');
    expect(w.emitted('event')).toBeUndefined();
    w.unmount();
  });
});
