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

import { GroupVideo } from '@action/actions/video/actions';
import { Video } from '@action/actions/video/Video';

function makeVideo(input = '/inputs/clip.mp4'): Video {
  const video = new Video();
  video.input = input;
  return video;
}

function lastCommand(): string {
  const calls = mockExec.mock.calls;
  return calls[calls.length - 1][0] as string;
}

describe('GroupVideo', () => {
  const tmpDir = path.join(os.tmpdir(), 'tipeline-video-test');

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
    it('creates a Video instance with the given input', async () => {
      const video = await GroupVideo.load({ input: '/inputs/clip.mp4' });
      expect(video.input).toBe('/inputs/clip.mp4');
      expect(video.videoFilters).toEqual([]);
      expect(video.audioFilters).toEqual([]);
    });

    it('throws when input is missing', async () => {
      await expect(GroupVideo.load({} as any)).rejects.toThrow();
    });
  });

  describe('trim', () => {
    it('queues an -ss/-t suffix option and returns the same instance', async () => {
      const video = makeVideo();
      const result = await GroupVideo.trim({ video, start: '00:00:10', duration: '00:00:30' });
      expect(result).toBe(video);
      expect(video.suffixOptions).toContainEqual(['-ss', '00:00:10', '-t', '00:00:30']);
    });

    it('throws when start is missing', async () => {
      const video = makeVideo();
      await expect(GroupVideo.trim({ video, duration: '00:00:30' } as any)).rejects.toThrow();
    });

    it('throws when video is not a Video instance', async () => {
      await expect(
        GroupVideo.trim({ video: {} as any, start: '0', duration: '1' })
      ).rejects.toThrow();
    });
  });

  describe('changeResolution', () => {
    it('queues a scale filter', async () => {
      const video = makeVideo();
      const result = await GroupVideo.changeResolution({ video, width: 1280, height: 720 });
      expect(result).toBe(video);
      expect(video.videoFilters).toContain('scale=1280:720');
    });

    it('throws when width is not a positive integer', async () => {
      const video = makeVideo();
      await expect(
        GroupVideo.changeResolution({ video, width: -1, height: 720 })
      ).rejects.toThrow();
    });
  });

  describe('crop', () => {
    it('queues a crop filter with width, height, x, y', async () => {
      const video = makeVideo();
      const result = await GroupVideo.crop({ video, width: 500, height: 300, x: 100, y: 50 });
      expect(result).toBe(video);
      expect(video.videoFilters).toContain('crop=500:300:100:50');
    });

    it('throws when x is negative', async () => {
      const video = makeVideo();
      await expect(
        GroupVideo.crop({ video, width: 500, height: 300, x: -1, y: 0 })
      ).rejects.toThrow();
    });
  });

  describe('rotate', () => {
    it('queues a transpose filter', async () => {
      const video = makeVideo();
      const result = await GroupVideo.rotate({ video, transpose: '1' });
      expect(result).toBe(video);
      expect(video.videoFilters).toContain('transpose=1');
    });

    it('throws for an invalid transpose value', async () => {
      const video = makeVideo();
      await expect(GroupVideo.rotate({ video, transpose: '5' as any })).rejects.toThrow();
    });
  });

  describe('changeFramerate', () => {
    it('queues an fps filter with round=up', async () => {
      const video = makeVideo();
      const result = await GroupVideo.changeFramerate({ video, fps: 24 });
      expect(result).toBe(video);
      expect(video.videoFilters).toContain('fps=24:round=up');
    });

    it('throws when fps is not a positive integer', async () => {
      const video = makeVideo();
      await expect(GroupVideo.changeFramerate({ video, fps: 0 })).rejects.toThrow();
    });
  });

  describe('changeVolume', () => {
    it('queues a volume audio filter', async () => {
      const video = makeVideo();
      const result = await GroupVideo.changeVolume({ video, volume: 0.7 });
      expect(result).toBe(video);
      expect(video.audioFilters).toContain('volume=0.7');
    });

    it('throws when volume is not positive', async () => {
      const video = makeVideo();
      await expect(GroupVideo.changeVolume({ video, volume: -1 })).rejects.toThrow();
    });
  });

  describe('mute', () => {
    it('queues a volume=0 audio filter', async () => {
      const video = makeVideo();
      const result = await GroupVideo.mute({ video });
      expect(result).toBe(video);
      expect(video.audioFilters).toContain('volume=0');
    });

    it('throws when video is missing', async () => {
      await expect(GroupVideo.mute({} as any)).rejects.toThrow();
    });
  });

  describe('replaceAudio', () => {
    it('runs ffmpeg to replace the audio track and resets the video to the temp output', async () => {
      const video = makeVideo();
      const result = await GroupVideo.replaceAudio({ video, audio: '/assets/voiceover.mp3' });

      expect(result).toBe(video);
      // save() (temp1) + the replaceAudio ffmpeg call (temp2) = 2 exec calls
      expect(mockExec).toHaveBeenCalledTimes(2);
      const replaceCmd = lastCommand();
      expect(replaceCmd).toContain('-i /assets/voiceover.mp3');
      expect(replaceCmd).toContain('-map 0:v -map 1:a');
      expect(video.input).not.toBe('/inputs/clip.mp4');
      expect(video.input.endsWith('.mp4')).toBe(true);
      // reset() clears queued filters/options
      expect(video.suffixOptions).toEqual([]);
      expect(video.videoFilters).toEqual([]);
    });

    it('throws when audio path is missing', async () => {
      const video = makeVideo();
      await expect(GroupVideo.replaceAudio({ video } as any)).rejects.toThrow();
    });

    it('propagates an ffmpeg failure as an Error with stderr as the message', async () => {
      const video = makeVideo();
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(new Error('exit code 1'), '', 'ffmpeg: no such filter');
      });
      await expect(
        GroupVideo.replaceAudio({ video, audio: '/assets/voiceover.mp3' })
      ).rejects.toThrow('ffmpeg: no such filter');
    });
  });

  describe('addBackgroundMusic', () => {
    it('runs ffmpeg with an amix filter at the given music volume', async () => {
      const video = makeVideo();
      const result = await GroupVideo.addBackgroundMusic({
        video,
        music: '/assets/bg.mp3',
        musicVolume: 0.4,
      });
      expect(result).toBe(video);
      const cmd = lastCommand();
      expect(cmd).toContain('[1:a]volume=0.4[a1]');
      expect(cmd).toContain('-i /assets/bg.mp3');
    });

    it('defaults musicVolume to 0.5 when omitted', async () => {
      const video = makeVideo();
      await GroupVideo.addBackgroundMusic({ video, music: '/assets/bg.mp3' } as any);
      const cmd = lastCommand();
      expect(cmd).toContain('[1:a]volume=0.5[a1]');
    });

    it('throws when music path is missing', async () => {
      const video = makeVideo();
      await expect(GroupVideo.addBackgroundMusic({ video } as any)).rejects.toThrow();
    });
  });

  describe('convertFormat', () => {
    it('queues a -f format suffix option', async () => {
      const video = makeVideo();
      const result = await GroupVideo.convertFormat({ video, format: 'mp4' });
      expect(result).toBe(video);
      expect(video.suffixOptions).toContainEqual(['-f', 'mp4']);
    });

    it('throws when format is an empty string', async () => {
      const video = makeVideo();
      await expect(GroupVideo.convertFormat({ video, format: '' })).rejects.toThrow();
    });
  });

  describe('compress', () => {
    it('queues libx264 compression options with crf and preset', async () => {
      const video = makeVideo();
      const result = await GroupVideo.compress({ video, crf: 28, preset: 'medium' });
      expect(result).toBe(video);
      expect(video.suffixOptions).toContainEqual(['-c:v', 'libx264', '-preset', 'medium', '-crf', '28', '-c:a', 'aac']);
    });

    it('throws when crf exceeds the maximum of 51', async () => {
      const video = makeVideo();
      await expect(GroupVideo.compress({ video, crf: 60, preset: 'medium' })).rejects.toThrow();
    });

    it('throws for an invalid preset value', async () => {
      const video = makeVideo();
      await expect(
        GroupVideo.compress({ video, crf: 28, preset: 'blazing' as any })
      ).rejects.toThrow();
    });
  });

  describe('addOverlay', () => {
    it('runs ffmpeg with an overlay filter at the given position', async () => {
      const video = makeVideo();
      const result = await GroupVideo.addOverlay({
        video,
        overlay: '/assets/lower_third.png',
        x: 20,
        y: 20,
        width: 400,
        height: 60,
      });
      expect(result).toBe(video);
      const cmd = lastCommand();
      expect(cmd).toContain('-i /assets/lower_third.png');
      expect(cmd).toContain('overlay=20:20');
      expect(cmd).toContain('scale=400:60:force_original_aspect_ratio=decrease');
    });

    it('defaults x/y to 10 and omits scaling when width/height are not given', async () => {
      const video = makeVideo();
      await GroupVideo.addOverlay({ video, overlay: '/assets/logo.png' } as any);
      const cmd = lastCommand();
      expect(cmd).toContain('[0:v][1:v]overlay=10:10');
    });

    it('throws when overlay path is missing', async () => {
      const video = makeVideo();
      await expect(GroupVideo.addOverlay({ video } as any)).rejects.toThrow();
    });
  });

  describe('addWatermark', () => {
    it('runs ffmpeg with a scaled watermark overlay', async () => {
      const video = makeVideo();
      const result = await GroupVideo.addWatermark({
        video,
        image: '/assets/logo.png',
        x: 10,
        y: 10,
        width: 120,
        height: 40,
      });
      expect(result).toBe(video);
      const cmd = lastCommand();
      expect(cmd).toContain('-loop 1 -i /assets/logo.png');
      expect(cmd).toContain('[1:v]scale=120:40[wm];');
      expect(cmd).toContain('[0:v][wm]overlay=10:10');
    });

    it('throws when image path is missing', async () => {
      const video = makeVideo();
      await expect(GroupVideo.addWatermark({ video } as any)).rejects.toThrow();
    });
  });

  describe('addSubtitles', () => {
    it('queues a subtitles filter', async () => {
      const video = makeVideo();
      const result = await GroupVideo.addSubtitles({ video, subtitle: '/assets/cc.srt' });
      expect(result).toBe(video);
      expect(video.videoFilters).toContain('subtitles=/assets/cc.srt');
    });

    it('throws when subtitle path is missing', async () => {
      const video = makeVideo();
      await expect(GroupVideo.addSubtitles({ video } as any)).rejects.toThrow();
    });
  });

  describe('getInfo', () => {
    it('probes with ffprobe and returns parsed JSON', async () => {
      const probeJson = JSON.stringify({ format: { duration: '12.34' }, streams: [] });
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.startsWith('ffprobe')) return callback(null, probeJson, '');
        callback(null, '', '');
      });

      const video = makeVideo();
      const result = await GroupVideo.getInfo({ video });
      expect(result).toEqual(JSON.parse(probeJson));
      expect(lastCommand()).toContain('ffprobe -v quiet -print_format json -show_format -show_streams');
    });

    it('propagates an ffprobe failure', async () => {
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.startsWith('ffprobe')) return callback(new Error('fail'), '', 'no such file');
        callback(null, '', '');
      });
      const video = makeVideo();
      await expect(GroupVideo.getInfo({ video })).rejects.toThrow('no such file');
    });

    it('throws when video is missing', async () => {
      await expect(GroupVideo.getInfo({} as any)).rejects.toThrow();
    });
  });

  describe('getDuration', () => {
    it('probes with ffprobe and returns a parsed float', async () => {
      mockExec.mockImplementation((command: string, callback: any) => {
        if (command.startsWith('ffprobe')) return callback(null, '42.500000\n', '');
        callback(null, '', '');
      });
      const video = makeVideo();
      const result = await GroupVideo.getDuration({ video });
      expect(result).toBe(42.5);
    });

    it('throws when video is missing', async () => {
      await expect(GroupVideo.getDuration({} as any)).rejects.toThrow();
    });
  });

  describe('getThumbnail', () => {
    it('creates the output directory and extracts a single frame', async () => {
      const video = makeVideo();
      const output = path.join(tmpDir, 'thumbs', 'thumb.jpg');
      const result = await GroupVideo.getThumbnail({ video, output, timestamp: '00:00:05' });

      expect(result).toBe(true);
      expect(fs.existsSync(path.dirname(output))).toBe(true);
      const cmd = lastCommand();
      expect(cmd).toContain('-ss 00:00:05');
      expect(cmd).toContain('-frames:v 1');
      expect(cmd).toContain(output);
    });

    it('throws when timestamp is missing', async () => {
      const video = makeVideo();
      const output = path.join(tmpDir, 'thumb.jpg');
      await expect(GroupVideo.getThumbnail({ video, output } as any)).rejects.toThrow();
    });

    it('propagates an ffmpeg failure', async () => {
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(new Error('fail'), '', 'invalid timestamp');
      });
      const video = makeVideo();
      const output = path.join(tmpDir, 'thumb.jpg');
      await expect(
        GroupVideo.getThumbnail({ video, output, timestamp: 'bogus' })
      ).rejects.toThrow('invalid timestamp');
    });
  });

  describe('extractFrames', () => {
    it('creates the output directory and extracts frames at the given fps', async () => {
      const video = makeVideo();
      const outputDir = path.join(tmpDir, 'frames');
      const result = await GroupVideo.extractFrames({ video, outputDir, fps: 1, format: 'jpg' });

      expect(result).toBe(true);
      expect(fs.existsSync(outputDir)).toBe(true);
      const cmd = lastCommand();
      expect(cmd).toContain('-vf fps=1');
      expect(cmd).toContain('frame_%03d.jpg');
    });

    it('includes -ss/-to when start and end are given', async () => {
      const video = makeVideo();
      const outputDir = path.join(tmpDir, 'frames2');
      await GroupVideo.extractFrames({
        video,
        outputDir,
        fps: 1,
        start: '00:00:05',
        end: '00:00:20',
      });
      const cmd = lastCommand();
      expect(cmd).toContain('-ss 00:00:05');
      expect(cmd).toContain('-to 00:00:20');
    });

    it('throws when fps is below the minimum of 1', async () => {
      const video = makeVideo();
      await expect(
        GroupVideo.extractFrames({ video, outputDir: tmpDir, fps: 0 })
      ).rejects.toThrow();
    });
  });

  describe('extractAudio', () => {
    it('extracts audio using the codec options for the output extension', async () => {
      const video = makeVideo();
      const output = path.join(tmpDir, 'audio.mp3');
      const result = await GroupVideo.extractAudio({ video, output });

      expect(result).toBe(true);
      const cmd = lastCommand();
      expect(cmd).toContain('-c:a libmp3lame -b:a 192k');
      expect(cmd).toContain('-vn');
    });

    it('throws for an unsupported output extension', async () => {
      const video = makeVideo();
      const output = path.join(tmpDir, 'audio.xyz');
      await expect(GroupVideo.extractAudio({ video, output })).rejects.toThrow(
        'Unsupported output extension: .xyz'
      );
    });

    it('throws when output path is missing', async () => {
      const video = makeVideo();
      await expect(GroupVideo.extractAudio({ video } as any)).rejects.toThrow();
    });
  });

  describe('generateGif', () => {
    it('creates the output directory and generates a GIF with fps/width', async () => {
      const video = makeVideo();
      const output = path.join(tmpDir, 'gifs', 'preview.gif');
      const result = await GroupVideo.generateGif({
        video,
        output,
        start: '00:00:02',
        duration: '3',
        fps: 10,
        width: 320,
      });

      expect(result).toBe(true);
      expect(fs.existsSync(path.dirname(output))).toBe(true);
      const cmd = lastCommand();
      expect(cmd).toContain('fps=10,scale=320:-1:flags=lanczos');
    });

    it('defaults fps to 10 and width to 320 when omitted', async () => {
      const video = makeVideo();
      const output = path.join(tmpDir, 'preview2.gif');
      await GroupVideo.generateGif({ video, output, start: '0', duration: '1' } as any);
      const cmd = lastCommand();
      expect(cmd).toContain('fps=10,scale=320:-1:flags=lanczos');
    });

    it('throws when start is missing', async () => {
      const video = makeVideo();
      const output = path.join(tmpDir, 'preview3.gif');
      await expect(GroupVideo.generateGif({ video, output, duration: '1' } as any)).rejects.toThrow();
    });
  });

  describe('blurRegion', () => {
    it('runs ffmpeg with crop/boxblur/overlay filters per region and resets the video', async () => {
      const video = makeVideo();
      const result = await GroupVideo.blurRegion({
        video,
        regions: [
          { x: 100, y: 50, width: 200, height: 200, blurStrength: 15, start: 1, end: 7 },
          { x: 400, y: 300, width: 400, height: 300, blurStrength: 20, start: 8, end: 14 },
        ],
      });

      expect(result).toBe(video);
      const cmd = lastCommand();
      expect(cmd).toContain("crop=200:200:100:50,boxblur=15:1:enable='between(t,1,7)'");
      expect(cmd).toContain("crop=400:300:400:300,boxblur=20:1:enable='between(t,8,14)'");
      expect(cmd).toContain('-map [overlay1]');
      expect(video.suffixOptions).toEqual([]);
    });

    it('defaults blurStrength to 10 when not provided', async () => {
      const video = makeVideo();
      await GroupVideo.blurRegion({
        video,
        regions: [{ x: 0, y: 0, width: 10, height: 10, start: 0, end: 1 }],
      });
      const cmd = lastCommand();
      expect(cmd).toContain('boxblur=10:1:');
    });

    it('throws when regions is empty of required fields', async () => {
      const video = makeVideo();
      await expect(
        GroupVideo.blurRegion({ video, regions: [{ x: 0 } as any] })
      ).rejects.toThrow();
    });

    it('propagates an ffmpeg failure', async () => {
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(new Error('fail'), '', 'filter error');
      });
      const video = makeVideo();
      await expect(
        GroupVideo.blurRegion({
          video,
          regions: [{ x: 0, y: 0, width: 10, height: 10, start: 0, end: 1 }],
        })
      ).rejects.toThrow('filter error');
    });
  });

  describe('save', () => {
    it('writes with stream-copy when no filters are queued', async () => {
      const video = makeVideo();
      const output = path.join(tmpDir, 'out.mp4');
      await GroupVideo.save({ video, output });

      expect(fs.existsSync(path.dirname(output))).toBe(true);
      const cmd = lastCommand();
      expect(cmd).toContain('-map 0:v');
      expect(cmd).toContain('-c:v copy');
      expect(cmd).toContain('-map 0:a');
      expect(cmd).toContain('-c:a copy');
      expect(cmd).not.toContain('-filter_complex');
    });

    it('builds a filter_complex graph when video/audio filters are queued', async () => {
      const video = makeVideo();
      video.videoFilters.push('scale=1280:720');
      video.audioFilters.push('volume=0.5');
      const output = path.join(tmpDir, 'out2.mp4');
      await GroupVideo.save({ video, output });

      const cmd = lastCommand();
      expect(cmd).toContain('-filter_complex [0:v]scale=1280:720[vf];[0:a]volume=0.5[af]');
      expect(cmd).toContain('-map [vf]');
      expect(cmd).toContain('-map [af]');
    });

    it('throws when output path is missing', async () => {
      const video = makeVideo();
      await expect(GroupVideo.save({ video } as any)).rejects.toThrow();
    });

    it('propagates an ffmpeg failure', async () => {
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(new Error('fail'), '', 'encoder not found');
      });
      const video = makeVideo();
      const output = path.join(tmpDir, 'out3.mp4');
      await expect(GroupVideo.save({ video, output })).rejects.toThrow('encoder not found');
    });
  });

  describe('export', () => {
    it('saves the file and cleans up temp files', async () => {
      const video = makeVideo();
      const tempFile = video.createTempFile('.mp4');
      const cleanupSpy = vi.spyOn(video, 'cleanup');
      const output = path.join(tmpDir, 'final.mp4');

      await GroupVideo.export({ video, output });

      expect(cleanupSpy).toHaveBeenCalled();
      expect(video.tempFiles).toContain(tempFile);
    });

    it('propagates an ffmpeg failure from the underlying save', async () => {
      mockExec.mockImplementation((command: string, callback: any) => {
        callback(new Error('fail'), '', 'bad codec');
      });
      const video = makeVideo();
      const output = path.join(tmpDir, 'final2.mp4');
      await expect(GroupVideo.export({ video, output })).rejects.toThrow('bad codec');
    });

    it('throws when video is missing', async () => {
      await expect(GroupVideo.export({ output: path.join(tmpDir, 'x.mp4') } as any)).rejects.toThrow();
    });
  });
});
