import { escapeFilterValue, fileArg, runMediaTool } from '@utils/mediaTool';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { Video } from './Video';
import { validations } from '@tipeline/schemas';

// Param type aliases
type LoadParams = z.infer<typeof validations.video.load.runtime.schema>;
type TrimParams = z.infer<typeof validations.video.trim.runtime.schema>;
type ChangeResolutionParams = z.infer<typeof validations.video.changeResolution.runtime.schema>;
type CropParams = z.infer<typeof validations.video.crop.runtime.schema>;
type RotateParams = z.infer<typeof validations.video.rotate.runtime.schema>;
type ChangeFramerateParams = z.infer<typeof validations.video.changeFramerate.runtime.schema>;
type ChangeVolumeParams = z.infer<typeof validations.video.changeVolume.runtime.schema>;
type MuteParams = z.infer<typeof validations.video.mute.runtime.schema>;
type ReplaceAudioParams = z.infer<typeof validations.video.replaceAudio.runtime.schema>;
type AddBackgroundMusicParams = z.infer<typeof validations.video.addBackgroundMusic.runtime.schema>;
type ConvertFormatParams = z.infer<typeof validations.video.convertFormat.runtime.schema>;
type CompressParams = z.infer<typeof validations.video.compress.runtime.schema>;
type AddOverlayParams = z.infer<typeof validations.video.addOverlay.runtime.schema>;
type AddWatermarkParams = z.infer<typeof validations.video.addWatermark.runtime.schema>;
type AddSubtitlesParams = z.infer<typeof validations.video.addSubtitles.runtime.schema>;
type GetInfoParams = z.infer<typeof validations.video.getInfo.runtime.schema>;
type GetDurationParams = z.infer<typeof validations.video.getDuration.runtime.schema>;
type GetThumbnailParams = z.infer<typeof validations.video.getThumbnail.runtime.schema>;
type ExtractFramesParams = z.infer<typeof validations.video.extractFrames.runtime.schema>;
type ExtractAudioParams = z.infer<typeof validations.video.extractAudio.runtime.schema>;
type GenerateGifParams = z.infer<typeof validations.video.generateGif.runtime.schema>;
type BlurRegionParams = z.infer<typeof validations.video.blurRegion.runtime.schema>;
type SaveParams = z.infer<typeof validations.video.export.runtime.schema>;
type ExportParams = z.infer<typeof validations.video.export.runtime.schema>;

/**
 * @group Actions
 */
export class GroupVideo {
  // --------------------------------------------------
  // I/O
  // --------------------------------------------------

  /**
   * Loads a video from a local file path into a mutable Video object.
   *
   * @param params - The input parameters.
   * @returns A new Video instance ready for chaining operations.
   * @example
   * ```yaml
   * # Load a video file — must be the first step before any transformation
   * - group: video
   *   name: load
   *   params:
   *     input: '{{ inputVideo }}'
   *   destination: videoObject
   * ```
   */
  static async load(params: LoadParams): Promise<Video> {
    const { input } = validations.video.load.runtime.validate(params);
    const video = new Video();
    video.input = input;
    return video;
  }

  // --------------------------------------------------
  // Editing & Transformation
  // --------------------------------------------------

  /**
   * Queues a segment cut on the video using start time and duration.
   *
   * This is a lazy operation — it accumulates on the Video object and
   * is only applied to disk when `export` is called.
   *
   * @param params - The input parameters.
   * @returns The same Video instance with the trim queued.
   * @example
   * ```yaml
   * # Cut a 30-second segment starting at 10 seconds — useful for isolating a clip
   * - group: video
   *   name: trim
   *   params:
   *     video: '{= videoObject =}'
   *     start: '00:00:10'
   *     duration: '00:00:30'
   *   destination: videoObject
   * ```
   */
  static async trim(params: TrimParams): Promise<Video> {
    const { video, start, duration } = validations.video.trim.runtime.validate(params);
    video.suffixOptions.push(['-ss', start, '-t', duration]);
    return video;
  }

  /**
   * Queues a resolution change (scale filter) on the video.
   *
   * This is a lazy operation — it accumulates on the Video object and
   * is only applied to disk when `export` is called.
   *
   * @param params - The input parameters.
   * @returns The same Video instance with the scale filter queued.
   * @example
   * ```yaml
   * # Resize to 1280×720 — useful for standardizing resolution before encoding
   * - group: video
   *   name: changeResolution
   *   params:
   *     video: '{= videoObject =}'
   *     width: 1280
   *     height: 720
   *   destination: videoObject
   * ```
   */
  static async changeResolution(params: ChangeResolutionParams): Promise<Video> {
    const { video, width, height } = validations.video.changeResolution.runtime.validate(params);
    video.videoFilters.push(`scale=${width}:${height}`);
    return video;
  }

  /**
   * Queues a crop filter to cut a rectangular region from the video frame.
   *
   * This is a lazy operation — it accumulates on the Video object and
   * is only applied to disk when `export` is called.
   *
   * @param params - The input parameters.
   * @returns The same Video instance with the crop filter queued.
   * @example
   * ```yaml
   * # Crop a 500×300 region starting at pixel (100, 50) — useful for removing borders
   * - group: video
   *   name: crop
   *   params:
   *     video: '{= videoObject =}'
   *     width: 500
   *     height: 300
   *     x: 100
   *     y: 50
   *   destination: videoObject
   * ```
   */
  static async crop(params: CropParams): Promise<Video> {
    const { video, width, height, x, y } = validations.video.crop.runtime.validate(params);
    video.videoFilters.push(`crop=${width}:${height}:${x}:${y}`);
    return video;
  }

  /**
   * Queues a transpose filter to rotate or flip the video.
   *
   * Transpose values: `0` = 90° CCW + flip, `1` = 90° CW, `2` = 90° CCW, `3` = 90° CW + flip.
   * This is a lazy operation — it accumulates on the Video object and
   * is only applied to disk when `export` is called.
   *
   * @param params - The input parameters.
   * @returns The same Video instance with the transpose filter queued.
   * @example
   * ```yaml
   * # Rotate 90° clockwise — useful for correcting portrait-mode recordings
   * - group: video
   *   name: rotate
   *   params:
   *     video: '{= videoObject =}'
   *     transpose: '1'
   *   destination: videoObject
   * ```
   */
  static async rotate(params: RotateParams): Promise<Video> {
    const { video, transpose } = validations.video.rotate.runtime.validate(params);
    video.videoFilters.push(`transpose=${transpose}`);
    return video;
  }

  /**
   * Queues a framerate change using the `fps` filter.
   *
   * This is a lazy operation — it accumulates on the Video object and
   * is only applied to disk when `export` is called.
   *
   * @param params - The input parameters.
   * @returns The same Video instance with the fps filter queued.
   * @example
   * ```yaml
   * # Reduce framerate to 24 fps — useful for lowering file size before distribution
   * - group: video
   *   name: changeFramerate
   *   params:
   *     video: '{= videoObject =}'
   *     fps: 24
   *   destination: videoObject
   * ```
   */
  static async changeFramerate(params: ChangeFramerateParams): Promise<Video> {
    const { video, fps } = validations.video.changeFramerate.runtime.validate(params);
    video.videoFilters.push(`fps=${fps}:round=up`);
    return video;
  }

  // --------------------------------------------------
  // Audio
  // --------------------------------------------------

  /**
   * Queues a volume adjustment using the `volume` audio filter.
   *
   * This is a lazy operation — it accumulates on the Video object and
   * is only applied to disk when `export` is called.
   *
   * @param params - The input parameters.
   * @returns The same Video instance with the volume filter queued.
   * @example
   * ```yaml
   * # Reduce volume to 70% — useful for background narration clips
   * - group: video
   *   name: changeVolume
   *   params:
   *     video: '{= videoObject =}'
   *     volume: 0.7
   *   destination: videoObject
   * ```
   */
  static async changeVolume(params: ChangeVolumeParams): Promise<Video> {
    const { video, volume } = validations.video.changeVolume.runtime.validate(params);
    video.audioFilters.push(`volume=${volume}`);
    return video;
  }

  /**
   * Queues a volume=0 filter to silence all audio on the video.
   *
   * This is a lazy operation — it accumulates on the Video object and
   * is only applied to disk when `export` is called.
   *
   * @param params - The input parameters.
   * @returns The same Video instance with the mute filter queued.
   * @example
   * ```yaml
   * # Silence the video — useful before adding a replacement audio track
   * - group: video
   *   name: mute
   *   params:
   *     video: '{= videoObject =}'
   *   destination: videoObject
   * ```
   */
  static async mute(params: MuteParams): Promise<Video> {
    const { video } = validations.video.mute.runtime.validate(params);
    video.audioFilters.push('volume=0');
    return video;
  }

  /**
   * Replaces the existing audio track with an external audio file.
   *
   * This is an eager operation — it runs FFmpeg immediately, writes a temp file,
   * and resets the Video's source to that file.
   *
   * @param params - The input parameters.
   * @returns The same Video instance pointing to the updated temp file.
   * @example
   * ```yaml
   * # Replace audio with a voiceover file — useful for dubbing or re-scoring
   * - group: video
   *   name: replaceAudio
   *   params:
   *     video: '{= videoObject =}'
   *     audio: '{{ videoFolder }}voiceover.mp3'
   *   destination: videoObject
   * ```
   */
  static async replaceAudio(params: ReplaceAudioParams): Promise<Video> {
    const { video, audio } = validations.video.replaceAudio.runtime.validate(params);

    const ext = path.extname(video.input) || '.mp4';
    const temp1 = video.createTempFile(ext);
    await GroupVideo.save({ video, output: temp1 });
    const temp2 = video.createTempFile(ext);
    await runMediaTool('ffmpeg', [
      '-y',
      '-i',
      temp1,
      '-i',
      audio,
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-c:v',
      'copy',
      '-shortest',
      temp2,
    ]);
    video.reset(temp2);
    return video;
  }

  /**
   * Mixes background music into the existing audio track at a specified volume.
   *
   * This is an eager operation — it runs FFmpeg immediately, writes a temp file,
   * and resets the Video's source to that file.
   *
   * @param params - The input parameters.
   * @returns The same Video instance pointing to the updated temp file.
   * @example
   * ```yaml
   * # Add background music at 40% volume — useful for promotional videos
   * - group: video
   *   name: addBackgroundMusic
   *   params:
   *     video: '{= videoObject =}'
   *     music: '{{ videoFolder }}background.mp3'
   *     musicVolume: 0.4
   *   destination: videoObject
   * ```
   */
  static async addBackgroundMusic(params: AddBackgroundMusicParams): Promise<Video> {
    const {
      video,
      music,
      musicVolume = 0.5,
    } = validations.video.addBackgroundMusic.runtime.validate(params);

    const ext = path.extname(video.input) || '.mp4';
    const temp1 = video.createTempFile(ext);
    await GroupVideo.save({ video, output: temp1 });
    const temp2 = video.createTempFile(ext);
    await runMediaTool('ffmpeg', [
      '-y',
      '-i',
      temp1,
      '-i',
      music,
      '-filter_complex',
      `[1:a]volume=${musicVolume}[a1];[0:a][a1]amix=inputs=2:duration=first:dropout_transition=2[outa]`,
      '-map',
      '0:v',
      '-map',
      '[outa]',
      '-c:v',
      'copy',
      '-shortest',
      temp2,
    ]);
    video.reset(temp2);
    return video;
  }

  // --------------------------------------------------
  // Conversion & Compression
  // --------------------------------------------------

  /**
   * Queues a container format change for the output file.
   *
   * This is a lazy operation — it accumulates on the Video object and
   * is only applied to disk when `export` is called.
   *
   * @param params - The input parameters.
   * @returns The same Video instance with the format option queued.
   * @example
   * ```yaml
   * # Transcode to mp4 container — useful when the source is mkv or webm
   * - group: video
   *   name: convertFormat
   *   params:
   *     video: '{= videoObject =}'
   *     format: mp4
   *   destination: videoObject
   * ```
   */
  static async convertFormat(params: ConvertFormatParams): Promise<Video> {
    const { video, format } = validations.video.convertFormat.runtime.validate(params);
    video.suffixOptions.push(['-f', format]);
    return video;
  }

  /**
   * Queues H.264 compression with a CRF quality value and encoding preset.
   *
   * CRF ranges from 0 (lossless) to 51 (worst). Presets range from
   * `ultrafast` (larger file, faster) to `veryslow` (smaller file, slower).
   * This is a lazy operation — it accumulates on the Video object and
   * is only applied to disk when `export` is called.
   *
   * @param params - The input parameters.
   * @returns The same Video instance with compression options queued.
   * @example
   * ```yaml
   * # Compress with CRF 28 at medium preset — good balance of quality and file size
   * - group: video
   *   name: compress
   *   params:
   *     video: '{= videoObject =}'
   *     crf: 28
   *     preset: medium
   *   destination: videoObject
   * ```
   */
  static async compress(params: CompressParams): Promise<Video> {
    const { video, crf, preset } = validations.video.compress.runtime.validate(params);
    video.suffixOptions.push(['-c:v', 'libx264', '-preset', preset, '-crf', String(crf), '-c:a', 'aac']);
    return video;
  }

  // --------------------------------------------------
  // Composition & Overlay
  // --------------------------------------------------

  /**
   * Overlays an image or video on top of the base video at a specified position.
   *
   * Optionally scales the overlay before compositing. This is an eager operation —
   * it runs FFmpeg immediately, writes a temp file, and resets the Video's source.
   *
   * @param params - The input parameters.
   * @returns The same Video instance pointing to the updated temp file.
   * @example
   * ```yaml
   * # Overlay a lower-third graphic at position (20, 20) scaled to 400×60
   * - group: video
   *   name: addOverlay
   *   params:
   *     video: '{= videoObject =}'
   *     overlay: '{{ videoFolder }}lower_third.png'
   *     x: 20
   *     y: 20
   *     width: 400
   *     height: 60
   *   destination: videoObject
   * ```
   */
  static async addOverlay(params: AddOverlayParams): Promise<Video> {
    const {
      video,
      overlay,
      x = 10,
      y = 10,
      width,
      height,
    } = validations.video.addOverlay.runtime.validate(params);

    const ext = path.extname(video.input) || '.mp4';
    const temp1 = video.createTempFile(ext);
    await GroupVideo.save({ video, output: temp1 });
    const temp2 = video.createTempFile(ext);

    let scaleFilter = '';
    if (width && height)
      scaleFilter = `scale=${width}:${height}:force_original_aspect_ratio=decrease`;
    else if (width) scaleFilter = `scale=${width}:-1`;
    else if (height) scaleFilter = `scale=-1:${height}`;

    const filter = scaleFilter
      ? `[1:v]${scaleFilter}[ovr];[0:v][ovr]overlay=${x}:${y}`
      : `[0:v][1:v]overlay=${x}:${y}`;

    await runMediaTool('ffmpeg', [
      '-y',
      '-i',
      temp1,
      '-i',
      overlay,
      '-filter_complex',
      filter,
      '-map',
      '0:a?',
      '-shortest',
      temp2,
    ]);
    video.reset(temp2);
    return video;
  }

  /**
   * Burns a static image watermark onto the video at a specified position.
   *
   * Optionally scales the watermark before compositing. This is an eager operation —
   * it runs FFmpeg immediately, writes a temp file, and resets the Video's source.
   *
   * @param params - The input parameters.
   * @returns The same Video instance pointing to the updated temp file.
   * @example
   * ```yaml
   * # Burn a 120×40 logo watermark in the top-right corner
   * - group: video
   *   name: addWatermark
   *   params:
   *     video: '{= videoObject =}'
   *     image: '{{ videoFolder }}logo.png'
   *     x: 10
   *     y: 10
   *     width: 120
   *     height: 40
   *   destination: videoObject
   * ```
   */
  static async addWatermark(params: AddWatermarkParams): Promise<Video> {
    const {
      video,
      image,
      x = 10,
      y = 10,
      width,
      height,
    } = validations.video.addWatermark.runtime.validate(params);

    const ext = path.extname(video.input) || '.mp4';
    const temp1 = video.createTempFile(ext);
    await GroupVideo.save({ video, output: temp1 });
    const temp2 = video.createTempFile(ext);

    const scale = width && height ? `[1:v]scale=${width}:${height}[wm];` : '';
    const overlay = width && height ? `[0:v][wm]overlay=${x}:${y}` : `overlay=${x}:${y}`;

    await runMediaTool('ffmpeg', [
      '-y',
      '-i',
      temp1,
      '-loop',
      '1',
      '-i',
      image,
      '-filter_complex',
      `${scale}${overlay}`,
      '-shortest',
      temp2,
    ]);
    video.reset(temp2);
    return video;
  }

  /**
   * Queues a subtitle burn-in filter using the `subtitles` FFmpeg filter.
   *
   * This is a lazy operation — it accumulates on the Video object and
   * is only applied to disk when `export` is called.
   *
   * @param params - The input parameters.
   * @returns The same Video instance with the subtitle filter queued.
   * @example
   * ```yaml
   * # Burn in SRT subtitles — useful for accessibility or social media exports
   * - group: video
   *   name: addSubtitles
   *   params:
   *     video: '{= videoObject =}'
   *     subtitle: '{{ videoFolder }}captions.srt'
   *   destination: videoObject
   * ```
   */
  static async addSubtitles(params: AddSubtitlesParams): Promise<Video> {
    const { video, subtitle } = validations.video.addSubtitles.runtime.validate(params);
    video.videoFilters.push(`subtitles=${escapeFilterValue(subtitle)}`);
    return video;
  }

  // --------------------------------------------------
  // Analysis & Metadata
  // --------------------------------------------------

  /**
   * Probes the video with `ffprobe` and returns full format and stream metadata.
   *
   * Flushes any pending lazy filters to a temp file before probing.
   *
   * @param params - The input parameters.
   * @returns A parsed JSON object containing format and stream details.
   * @example
   * ```yaml
   * # Retrieve codec, resolution, bitrate, and container info
   * - group: video
   *   name: getInfo
   *   params:
   *     video: '{= videoObject =}'
   *   destination: videoInfo
   * ```
   */
  static async getInfo(params: GetInfoParams): Promise<any> {
    const { video } = validations.video.getInfo.runtime.validate(params);

    const ext = path.extname(video.input) || '.mp4';
    const temp1 = video.createTempFile(ext);
    await GroupVideo.save({ video, output: temp1 });

    return JSON.parse(
      await runMediaTool('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', temp1])
    );
  }

  /**
   * Returns the total duration of the video in seconds.
   *
   * Flushes any pending lazy filters to a temp file before probing.
   *
   * @param params - The input parameters.
   * @returns The video duration as a floating-point number of seconds.
   * @example
   * ```yaml
   * # Get duration in seconds — useful for calculating segment counts
   * - group: video
   *   name: getDuration
   *   params:
   *     video: '{= videoObject =}'
   *   destination: videoDuration
   * ```
   */
  static async getDuration(params: GetDurationParams): Promise<number> {
    const { video } = validations.video.getDuration.runtime.validate(params);

    const ext = path.extname(video.input) || '.mp4';
    const temp1 = video.createTempFile(ext);
    await GroupVideo.save({ video, output: temp1 });

    const stdout = await runMediaTool('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      temp1,
    ]);
    return parseFloat(stdout.trim());
  }

  /**
   * Extracts a single frame from the video at the given timestamp and writes it as an image.
   *
   * Flushes any pending lazy filters to a temp file before extracting.
   *
   * @param params - The input parameters.
   * @returns `true` when the thumbnail file has been written successfully.
   * @example
   * ```yaml
   * # Extract a thumbnail at the 5-second mark — useful for preview images
   * - group: video
   *   name: getThumbnail
   *   params:
   *     video: '{= videoObject =}'
   *     output: '{{ videoFolder }}thumbnail.jpg'
   *     timestamp: '00:00:05'
   * ```
   */
  static async getThumbnail(params: GetThumbnailParams): Promise<boolean> {
    const { video, output, timestamp } = validations.video.getThumbnail.runtime.validate(params);

    fs.mkdirSync(path.dirname(output), { recursive: true });

    const ext = path.extname(video.input) || '.mp4';
    const temp1 = video.createTempFile(ext);
    await GroupVideo.save({ video, output: temp1 });

    await runMediaTool('ffmpeg', ['-y', '-ss', timestamp, '-i', temp1, '-frames:v', '1', fileArg(output)]);
    return true;
  }

  // --------------------------------------------------
  // Extraction & Output
  // --------------------------------------------------

  /**
   * Extracts individual frames from the video and writes them as image files.
   *
   * Supports optional time range (`start`/`end`) and output format (`png`, `jpg`, `bmp`).
   * Flushes any pending lazy filters to a temp file before extracting.
   *
   * @param params - The input parameters.
   * @returns `true` when all frame files have been written successfully.
   * @example
   * ```yaml
   * # Extract 1 frame per second as JPG between 5 s and 20 s
   * - group: video
   *   name: extractFrames
   *   params:
   *     video: '{= videoObject =}'
   *     outputDir: '{{ videoFolder }}frames'
   *     fps: 1
   *     format: jpg
   *     start: '00:00:05'
   *     end: '00:00:20'
   * ```
   */
  static async extractFrames(params: ExtractFramesParams): Promise<boolean> {
    const {
      video,
      outputDir,
      fps,
      format = 'png',
      start,
      end,
    } = validations.video.extractFrames.runtime.validate(params);

    fs.mkdirSync(outputDir, { recursive: true });

    const ext = path.extname(video.input) || '.mp4';
    const temp1 = video.createTempFile(ext);
    await GroupVideo.save({ video, output: temp1 });

    const outputPattern = path.join(outputDir, `frame_%03d.${format}`);
    const args = ['-y'];
    if (start) args.push('-ss', start);
    args.push('-i', temp1);
    if (end) args.push('-to', end);
    args.push('-vf', `fps=${fps}`, fileArg(outputPattern));
    await runMediaTool('ffmpeg', args);
    return true;
  }

  /**
   * Demuxes and transcodes the audio track to a standalone audio file.
   *
   * Supported output extensions: `.aac`, `.mp3`, `.ac3`, `.opus`, `.wav`.
   * Flushes any pending lazy filters to a temp file before extracting.
   *
   * @param params - The input parameters.
   * @returns `true` when the audio file has been written successfully.
   * @example
   * ```yaml
   * # Extract the audio track as an MP3 file — useful for podcast or transcript workflows
   * - group: video
   *   name: extractAudio
   *   params:
   *     video: '{= videoObject =}'
   *     output: '{{ videoFolder }}audio.mp3'
   * ```
   */
  static async extractAudio(params: ExtractAudioParams): Promise<boolean> {
    const { video, output } = validations.video.extractAudio.runtime.validate(params);
    fs.mkdirSync(path.dirname(output), { recursive: true });

    const extension = path.extname(video.input) || '.mp4';
    const temp1 = video.createTempFile(extension);
    await GroupVideo.save({ video, output: temp1 });

    const ext = path.extname(output).toLowerCase();
    const options: Record<string, string[]> = {
      '.aac': ['-c:a', 'aac', '-b:a', '192k'],
      '.mp3': ['-c:a', 'libmp3lame', '-b:a', '192k'],
      '.ac3': ['-c:a', 'ac3', '-b:a', '192k'],
      '.opus': ['-c:a', 'libopus', '-b:a', '128k'],
      '.wav': ['-c:a', 'pcm_s16le'],
    };
    if (!options[ext]) throw new Error(`Unsupported output extension: ${ext}`);
    await runMediaTool('ffmpeg', ['-y', '-i', temp1, '-vn', ...options[ext], fileArg(output)]);
    return true;
  }

  /**
   * Generates an animated GIF from a video segment with configurable fps and width.
   *
   * Uses the lanczos scaling algorithm. Flushes pending lazy filters before generating.
   *
   * @param params - The input parameters.
   * @returns `true` when the GIF file has been written successfully.
   * @example
   * ```yaml
   * # Generate a 320px-wide GIF at 10 fps from a 3-second segment starting at 2 s
   * - group: video
   *   name: generateGif
   *   params:
   *     video: '{= videoObject =}'
   *     output: '{{ videoFolder }}preview.gif'
   *     start: '00:00:02'
   *     duration: '3'
   *     fps: 10
   *     width: 320
   * ```
   */
  static async generateGif(params: GenerateGifParams): Promise<boolean> {
    const {
      video,
      output,
      start,
      duration,
      fps = 10,
      width = 320,
    } = validations.video.generateGif.runtime.validate(params);

    const ext = path.extname(video.input) || '.mp4';
    const temp1 = video.createTempFile(ext);
    await GroupVideo.save({ video, output: temp1 });

    fs.mkdirSync(path.dirname(output), { recursive: true });
    await runMediaTool('ffmpeg', [
      '-y',
      '-ss',
      start,
      '-t',
      duration,
      '-i',
      temp1,
      '-vf',
      `fps=${fps},scale=${width}:-1:flags=lanczos`,
      fileArg(output),
    ]);
    return true;
  }

  // --------------------------------------------------
  // Privacy & Compliance
  // --------------------------------------------------

  /**
   * Blurs one or more rectangular regions for specified time intervals.
   *
   * Each region defines its position, size, time range (`start`/`end` in seconds),
   * and optional blur strength. This is an eager operation — it runs FFmpeg immediately,
   * writes a temp file, and resets the Video's source.
   *
   * @param params - The input parameters.
   * @returns The same Video instance pointing to the updated temp file.
   * @example
   * ```yaml
   * # Blur a face region from seconds 1–7 and a screen region from 8–14
   * - group: video
   *   name: blurRegion
   *   params:
   *     video: '{= videoObject =}'
   *     regions:
   *       - x: 100
   *         y: 50
   *         width: 200
   *         height: 200
   *         blurStrength: 15
   *         start: 1
   *         end: 7
   *       - x: 400
   *         y: 300
   *         width: 400
   *         height: 300
   *         blurStrength: 20
   *         start: 8
   *         end: 14
   *   destination: videoObject
   * ```
   */
  static async blurRegion(params: BlurRegionParams): Promise<Video> {
    const { video, regions } = validations.video.blurRegion.runtime.validate(params);

    const ext = path.extname(video.input) || '.mp4';
    const temp1 = video.createTempFile(ext);
    await GroupVideo.save({ video, output: temp1 });
    const temp2 = video.createTempFile(ext);

    const filters: string[] = [];
    const overlays: string[] = [];
    regions.forEach((r: any, i: any) => {
      const enable = `enable='between(t,${r.start},${r.end})'`;
      filters.push(
        `[0:v]crop=${r.width}:${r.height}:${r.x}:${r.y},boxblur=${r.blurStrength || 10}:1:${enable}[blur${i}]`
      );
      overlays.push(
        `${i === 0 ? '[0:v]' : `[overlay${i - 1}]`}[blur${i}]overlay=${r.x}:${r.y}:${enable}[overlay${i}]`
      );
    });

    await runMediaTool('ffmpeg', [
      '-y',
      '-i',
      temp1,
      '-filter_complex',
      `${filters.join('; ')}; ${overlays.join('; ')}`,
      '-map',
      `[overlay${regions.length - 1}]`,
      '-map',
      '0:a?',
      '-c:a',
      'copy',
      temp2,
    ]);
    video.reset(temp2);
    return video;
  }

  /**
   * Writes all accumulated lazy filters to disk without cleaning up temp files.
   *
   * Used internally by eager operations and extraction actions. Prefer `export`
   * as the terminal step in a pipeline — it calls `save` then cleans up temp files.
   *
   * @param params - The input parameters.
   * @returns A promise that resolves when the file has been written.
   * @example
   * ```yaml
   * # Write the video to disk mid-pipeline without discarding temp files
   * - group: video
   *   name: save
   *   params:
   *     video: '{= videoObject =}'
   *     output: '{{ videoFolder }}intermediate.mp4'
   * ```
   */
  static async save(params: SaveParams): Promise<void> {
    const { video, output } = validations.video.export.runtime.validate(params);
    fs.mkdirSync(path.dirname(output), { recursive: true });

    const args = ['-y', '-i', video.input, ...video.prefixOptions.flat()];

    // Detect whether an explicit codec was queued (e.g. by compress) so we
    // don't emit -c:v copy / -c:a copy on top of it.
    const hasExplicitVideoCodec = video.suffixOptions.some((o) => o.includes('-c:v'));
    const hasExplicitAudioCodec = video.suffixOptions.some((o) => o.includes('-c:a'));

    const filters: string[] = [];
    if (video.videoFilters.length > 0) {
      filters.push(`[0:v]${video.videoFilters.join(',')}[vf]`);
      video.suffixOptions.push(['-map', '[vf]']);
    } else {
      video.suffixOptions.push(['-map', '0:v']);
      // Stream-copy when no video transformation is queued — avoids a full
      // re-encode that would peg the CPU for the entire duration of the file.
      if (!hasExplicitVideoCodec) video.suffixOptions.push(['-c:v', 'copy']);
    }

    if (video.audioFilters.length > 0) {
      filters.push(`[0:a]${video.audioFilters.join(',')}[af]`);
      video.suffixOptions.push(['-map', '[af]']);
    } else {
      video.suffixOptions.push(['-map', '0:a']);
      if (!hasExplicitAudioCodec) video.suffixOptions.push(['-c:a', 'copy']);
    }

    if (filters.length > 0) {
      args.push('-filter_complex', filters.join(';'));
    }

    args.push(...video.suffixOptions.flat(), fileArg(output));

    await runMediaTool('ffmpeg', args);
  }

  /**
   * Finalizes the video pipeline: writes all accumulated filters to the output file
   * and cleans up all temporary files created during eager operations.
   *
   * This should be the last action in any video pipeline.
   *
   * @param params - The input parameters.
   * @returns A promise that resolves when the file has been written and temps cleaned up.
   * @example
   * ```yaml
   * # Write the final video to disk and clean up all temp files
   * - group: video
   *   name: export
   *   params:
   *     video: '{= videoObject =}'
   *     output: '{{ videoFolder }}output.mp4'
   * ```
   */
  static async export(params: ExportParams): Promise<void> {
    const { video } = validations.video.export.runtime.validate(params);
    await GroupVideo.save(params);
    video.cleanup();
  }
}
