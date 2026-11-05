import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execFile } = vi.hoisted(() => ({
  execFile: vi.fn((_tool: string, _args: string[], _options: unknown, callback: any) => callback(null, 'out', '')),
}));
vi.mock('child_process', () => ({ execFile }));

import { GroupAudio } from '@action/actions/audio/actions';
import { Audio } from '@action/actions/audio/Audio';
import { GroupVideo } from '@action/actions/video/actions';
import { Video } from '@action/actions/video/Video';
import { commandError } from '@utils/commandError';
import { escapeFilterValue, fileArg, runMediaTool } from '@utils/mediaTool';

const ATTACK = '$(touch /tmp/pwned)"; touch /tmp/pwned; echo "`touch /tmp/pwned`';

describe('media tools', () => {
  beforeEach(() => {
    execFile.mockClear();
  });

  it('runs the tool directly, without a shell', async () => {
    await expect(runMediaTool('ffprobe', ['-v', 'quiet'])).resolves.toBe('out');
    const [tool, args, options] = execFile.mock.calls[0];
    expect(tool).toBe('ffprobe');
    expect(args).toEqual(['-v', 'quiet']);
    expect(options).not.toHaveProperty('shell');
  });

  it('passes a hostile path as one untouched argument', async () => {
    const audio = new Audio();
    audio.input = ATTACK;
    execFile.mockImplementationOnce((_t, _a, _o, callback) => callback(null, '{}', ''));
    await GroupAudio.getInfo({ audio } as any);
    expect(execFile.mock.calls[0][1]).toContain(ATTACK);
  });

  it('keeps a value with spaces from adding its own options', async () => {
    const video = new Video();
    video.input = '/in.mp4';
    await GroupVideo.trim({ video, start: '00:00:01 -f null', duration: '5' } as any);
    await GroupVideo.save({ video, output: '/tmp/tipeline-media-test/out.mp4' } as any);
    expect(execFile.mock.calls[0][1]).toContain('00:00:01 -f null');
    expect(execFile.mock.calls[0][1]).not.toContain('-f');
  });

  it('never lets an output path read as an option', () => {
    expect(fileArg('-f')).toBe('./-f');
    expect(fileArg('/tmp/a.mp4')).toBe('/tmp/a.mp4');
  });

  it('escapes a filter value for both of the times ffmpeg reads it', () => {
    expect(escapeFilterValue('/a b/c.srt')).toBe('/a b/c.srt');
    expect(escapeFilterValue(`a'b`)).toBe(`a\\\\\\'b`);
    expect(escapeFilterValue('a:b')).toBe('a\\\\:b');
    expect(escapeFilterValue('a,b;c[d]')).toBe('a\\,b\\;c\\[d\\]');
  });
});

describe('commandError', () => {
  const failure = new Error('Command failed: ffprobe x');

  it('falls back to the command when the tool said nothing', () => {
    expect(commandError(failure, '').message).toBe('Command failed: ffprobe x');
  });

  it("keeps ffmpeg's last lines, not its banner", () => {
    const stderr = ['ffmpeg version 7', 'built with', 'configuration: x', 'a', 'b', 'c', 'No such file', ''].join('\n');
    expect(commandError(failure, stderr).message).toBe('a\nb\nc\nNo such file');
  });
});
