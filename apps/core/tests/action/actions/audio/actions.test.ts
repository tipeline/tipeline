import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// --------------------------------------------------
// Mock `child_process.execFile` so no real ffmpeg/ffprobe binary is ever invoked.
// Calls are recorded as one joined command line, which is what these tests read.
// --------------------------------------------------
const { mockExec } = vi.hoisted(() => {
  const mockExec = vi.fn(
    (command: string, callback: (err: any, stdout: string, stderr: string) => void) => {
      callback(null, '', '');
    }
  );
  return { mockExec };
});

vi.mock('child_process', () => ({
  execFile: (tool: string, args: string[], _options: unknown, callback: any) =>
    mockExec([tool, ...args].join(' '), callback),
}));

import { GroupAudio } from '@action/actions/audio/actions';
import { Audio } from '@action/actions/audio/Audio';

function makeAudio(input = '/inputs/track.mp3'): Audio {
  const audio = new Audio();
  audio.input = input;
  return audio;
}

function lastCommand(): string {
  const calls = mockExec.mock.calls;
  return calls[calls.length - 1][0] as string;
}

describe('GroupAudio', () => {
  const tmpDir = path.join(os.tmpdir(), 'tipeline-audio-test');

  beforeEach(() => {
    vi.clearAllMocks();
    mockExec.mockImplementation((command: string, callback: any) => callback(null, '', ''));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('load', () => {
    it('creates an Audio instance with the given input', async () => {
      const audio = await GroupAudio.load({ input: '/inputs/track.mp3' });
      expect(audio.input).toBe('/inputs/track.mp3');
      expect(audio.audioFilters).toEqual([]);
    });

    it('throws when input is missing', async () => {
      await expect(GroupAudio.load({} as any)).rejects.toThrow();
    });
  });

  describe('convertFormat', () => {
    it('queues a -f format suffix option and sets audio.format', async () => {
      const audio = makeAudio();
      const result = await GroupAudio.convertFormat({ audio, format: 'wav' });
      expect(result).toBe(audio);
      expect(audio.suffixOptions).toContainEqual(['-f', 'wav']);
      expect(audio.format).toBe('wav');
    });

    it('replaces a previously queued -f option rather than duplicating it', async () => {
      const audio = makeAudio();
      await GroupAudio.convertFormat({ audio, format: 'wav' });
      await GroupAudio.convertFormat({ audio, format: 'flac' });
      expect(audio.suffixOptions).toEqual([['-f', 'flac']]);
    });

    it('throws for an unsupported format', async () => {
      const audio = makeAudio();
      await expect(GroupAudio.convertFormat({ audio, format: 'mid' as any })).rejects.toThrow();
    });
  });

  describe('compress', () => {
    it('queues a -b:a bitrate suffix option', async () => {
      const audio = makeAudio();
      const result = await GroupAudio.compress({ audio, bitrate: '96k' });
      expect(result).toBe(audio);
      expect(audio.suffixOptions).toContainEqual(['-b:a', '96k']);
    });

    it('throws when bitrate is an empty string', async () => {
      const audio = makeAudio();
      await expect(GroupAudio.compress({ audio, bitrate: '' })).rejects.toThrow();
    });
  });

  describe('trim', () => {
    it('queues a -ss/-t suffix option', async () => {
      const audio = makeAudio();
      const result = await GroupAudio.trim({ audio, start: '00:00:00', duration: '00:00:30' });
      expect(result).toBe(audio);
      expect(audio.suffixOptions).toContainEqual(['-ss', '00:00:00', '-t', '00:00:30']);
    });

    it('throws when duration is missing', async () => {
      const audio = makeAudio();
      await expect(GroupAudio.trim({ audio, start: '0' } as any)).rejects.toThrow();
    });
  });

  describe('concatenate', () => {
    it('flushes to a temp file, runs ffmpeg concat, and resets the audio to the merged output', async () => {
      const audio = makeAudio();
      const result = await GroupAudio.concatenate({
        audio,
        inputs: ['/assets/intro.mp3', '/assets/outro.mp3'],
      });

      expect(result).toBe(audio);
      // save() to flush current state (1) + the concat ffmpeg call (2)
      expect(mockExec).toHaveBeenCalledTimes(2);
      const cmd = lastCommand();
      expect(cmd).toContain('concat=n=3:v=0:a=1[out]');
      expect(cmd).toContain('-i /assets/intro.mp3');
      expect(cmd).toContain('-i /assets/outro.mp3');
      expect(audio.input).not.toBe('/inputs/track.mp3');
      expect(audio.suffixOptions).toEqual([]);
    });

    it('throws when inputs is an empty array', async () => {
      const audio = makeAudio();
      await expect(GroupAudio.concatenate({ audio, inputs: [] })).rejects.toThrow();
    });

    it('propagates an ffmpeg failure', async () => {
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(new Error('fail'), '', 'concat filter error');
      });
      const audio = makeAudio();
      await expect(
        GroupAudio.concatenate({ audio, inputs: ['/assets/intro.mp3'] })
      ).rejects.toThrow('concat filter error');
    });
  });

  describe('changeVolume', () => {
    it('queues a volume filter', async () => {
      const audio = makeAudio();
      const result = await GroupAudio.changeVolume({ audio, volume: 0.8 });
      expect(result).toBe(audio);
      expect(audio.audioFilters).toContain('volume=0.8');
    });

    it('replaces a previously queued volume filter rather than duplicating it', async () => {
      const audio = makeAudio();
      await GroupAudio.changeVolume({ audio, volume: 0.8 });
      await GroupAudio.changeVolume({ audio, volume: 1.5 });
      expect(audio.audioFilters.filter((f) => f.startsWith('volume='))).toEqual(['volume=1.5']);
    });

    it('throws when volume is missing', async () => {
      const audio = makeAudio();
      await expect(GroupAudio.changeVolume({ audio } as any)).rejects.toThrow();
    });
  });

  describe('fadeIn', () => {
    it('queues an afade=t=in filter using duration and start', async () => {
      const audio = makeAudio();
      const result = await GroupAudio.fadeIn({ audio, duration: 2, start: 0 });
      expect(result).toBe(audio);
      expect(audio.audioFilters).toContain('afade=t=in:st=0:d=2');
    });

    it('throws when duration is not positive', async () => {
      const audio = makeAudio();
      await expect(GroupAudio.fadeIn({ audio, duration: 0 } as any)).rejects.toThrow();
    });
  });

  describe('fadeOut', () => {
    it('queues an afade=t=out filter using duration and start', async () => {
      const audio = makeAudio();
      const result = await GroupAudio.fadeOut({ audio, duration: 3, start: 27 });
      expect(result).toBe(audio);
      expect(audio.audioFilters).toContain('afade=t=out:st=27:d=3');
    });

    it('throws when start is missing (no default, unlike fadeIn)', async () => {
      const audio = makeAudio();
      await expect(GroupAudio.fadeOut({ audio, duration: 3 } as any)).rejects.toThrow();
    });
  });

  describe('changeSpeed', () => {
    it('queues a single atempo stage for speeds within [0.5, 2.0]', async () => {
      const audio = makeAudio();
      const result = await GroupAudio.changeSpeed({ audio, speed: 1.5 });
      expect(result).toBe(audio);
      expect(audio.audioFilters).toEqual(['atempo=1.5000']);
    });

    it('chains multiple atempo stages for speeds above 2.0', async () => {
      const audio = makeAudio();
      await GroupAudio.changeSpeed({ audio, speed: 3.0 });
      expect(audio.audioFilters).toEqual(['atempo=2.0', 'atempo=1.5000']);
    });

    it('chains multiple atempo stages for speeds below 0.5', async () => {
      const audio = makeAudio();
      await GroupAudio.changeSpeed({ audio, speed: 0.25 });
      expect(audio.audioFilters).toEqual(['atempo=0.5', 'atempo=0.5000']);
    });

    it('throws when speed is below the minimum of 0.25', async () => {
      const audio = makeAudio();
      await expect(GroupAudio.changeSpeed({ audio, speed: 0.1 })).rejects.toThrow();
    });

    it('throws when speed exceeds the maximum of 4.0', async () => {
      const audio = makeAudio();
      await expect(GroupAudio.changeSpeed({ audio, speed: 5 })).rejects.toThrow();
    });
  });

  describe('addSilence', () => {
    it('queues an adelay filter for position "start"', async () => {
      const audio = makeAudio();
      const result = await GroupAudio.addSilence({ audio, duration: 1, position: 'start' });
      expect(result).toBe(audio);
      expect(audio.audioFilters).toContain('adelay=1000:all=1');
    });

    it('queues an apad filter for position "end"', async () => {
      const audio = makeAudio();
      const result = await GroupAudio.addSilence({ audio, duration: 2.5, position: 'end' });
      expect(result).toBe(audio);
      expect(audio.audioFilters).toContain('apad=pad_dur=2.5');
    });

    it('throws for an invalid position value', async () => {
      const audio = makeAudio();
      await expect(
        GroupAudio.addSilence({ audio, duration: 1, position: 'middle' as any })
      ).rejects.toThrow();
    });
  });

  describe('mixAudio', () => {
    it('flushes to a temp file, runs ffmpeg amix with volume, and resets the audio', async () => {
      const audio = makeAudio();
      const result = await GroupAudio.mixAudio({
        audio,
        input: '/assets/background.mp3',
        volume: 0.3,
      });

      expect(result).toBe(audio);
      expect(mockExec).toHaveBeenCalledTimes(2);
      const cmd = lastCommand();
      expect(cmd).toContain('[1:a]volume=0.3[bg]');
      expect(cmd).toContain('-i /assets/background.mp3');
      expect(audio.audioFilters).toEqual([]);
    });

    it('uses an unweighted amix filter when volume is omitted', async () => {
      const audio = makeAudio();
      await GroupAudio.mixAudio({ audio, input: '/assets/background.mp3' } as any);
      const cmd = lastCommand();
      expect(cmd).toContain('[0:a][1:a]amix=inputs=2:duration=first[out]');
    });

    it('throws when input path is missing', async () => {
      const audio = makeAudio();
      await expect(GroupAudio.mixAudio({ audio } as any)).rejects.toThrow();
    });

    it('propagates an ffmpeg failure', async () => {
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(new Error('fail'), '', 'amix filter error');
      });
      const audio = makeAudio();
      await expect(
        GroupAudio.mixAudio({ audio, input: '/assets/background.mp3' })
      ).rejects.toThrow('amix filter error');
    });
  });

  describe('getInfo', () => {
    it('probes with ffprobe and returns parsed JSON', async () => {
      const probeJson = JSON.stringify({ format: { duration: '10.0' }, streams: [] });
      mockExec.mockImplementation((command: string, callback: any) => callback(null, probeJson, ''));

      const audio = makeAudio();
      const result = await GroupAudio.getInfo({ audio });
      expect(result).toEqual(JSON.parse(probeJson));
      expect(lastCommand()).toContain('ffprobe -v quiet -print_format json -show_format -show_streams');
    });

    it('propagates an ffprobe failure', async () => {
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(new Error('fail'), '', 'no such file');
      });
      const audio = makeAudio();
      await expect(GroupAudio.getInfo({ audio })).rejects.toThrow('no such file');
    });

    it('throws when audio is missing', async () => {
      await expect(GroupAudio.getInfo({} as any)).rejects.toThrow();
    });
  });

  describe('normalize', () => {
    it('queues a loudnorm filter', async () => {
      const audio = makeAudio();
      const result = await GroupAudio.normalize({ audio });
      expect(result).toBe(audio);
      expect(audio.audioFilters).toContain('loudnorm');
    });

    it('does not duplicate the loudnorm filter when called twice', async () => {
      const audio = makeAudio();
      await GroupAudio.normalize({ audio });
      await GroupAudio.normalize({ audio });
      expect(audio.audioFilters.filter((f) => f === 'loudnorm')).toHaveLength(1);
    });

    it('throws when audio is missing', async () => {
      await expect(GroupAudio.normalize({} as any)).rejects.toThrow();
    });
  });

  describe('save', () => {
    it('creates the output directory and runs ffmpeg with queued filters/options', async () => {
      const audio = makeAudio();
      audio.audioFilters.push('volume=0.5');
      audio.suffixOptions.push(['-b:a', '96k']);
      const output = path.join(tmpDir, 'nested', 'out.mp3');

      await GroupAudio.save({ audio, output });

      expect(fs.existsSync(path.dirname(output))).toBe(true);
      const cmd = lastCommand();
      expect(cmd).toContain('-filter:a volume=0.5');
      expect(cmd).toContain('-b:a 96k');
      expect(cmd).toContain(output);
    });

    it('throws when the output extension does not match a queued format', async () => {
      const audio = makeAudio();
      audio.format = 'wav';
      const output = path.join(tmpDir, 'out.mp3');
      await expect(GroupAudio.save({ audio, output })).rejects.toThrow(
        /does not match the specified format/
      );
    });

    it('propagates an ffmpeg failure', async () => {
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(new Error('fail'), '', 'invalid filter');
      });
      const audio = makeAudio();
      const output = path.join(tmpDir, 'out2.mp3');
      await expect(GroupAudio.save({ audio, output })).rejects.toThrow('invalid filter');
    });

    it('throws when output path is missing', async () => {
      const audio = makeAudio();
      await expect(GroupAudio.save({ audio } as any)).rejects.toThrow();
    });
  });

  describe('export', () => {
    it('saves the file and cleans up temp files', async () => {
      const audio = makeAudio();
      const tempFile = audio.createTempFile('.mp3');
      const cleanupSpy = vi.spyOn(audio, 'cleanup');
      const output = path.join(tmpDir, 'final.mp3');

      await GroupAudio.export({ audio, output });

      expect(cleanupSpy).toHaveBeenCalled();
      expect(audio.tempFiles).toContain(tempFile);
    });

    it('propagates an ffmpeg failure from the underlying save', async () => {
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(new Error('fail'), '', 'bad codec');
      });
      const audio = makeAudio();
      const output = path.join(tmpDir, 'final2.mp3');
      await expect(GroupAudio.export({ audio, output })).rejects.toThrow('bad codec');
    });

    it('throws when audio is missing', async () => {
      await expect(GroupAudio.export({ output: path.join(tmpDir, 'x.mp3') } as any)).rejects.toThrow();
    });
  });
});
