import { fileArg, runMediaTool } from '@utils/mediaTool';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { Audio } from '@/action/actions/audio/Audio';
import { validations } from '@tipeline/schemas';

type LoadParams = z.infer<typeof validations.audio.load.runtime.schema>;
type ConvertFormatParams = z.infer<typeof validations.audio.convertFormat.runtime.schema>;
type CompressParams = z.infer<typeof validations.audio.compress.runtime.schema>;
type TrimParams = z.infer<typeof validations.audio.trim.runtime.schema>;
type ConcatenateParams = z.infer<typeof validations.audio.concatenate.runtime.schema>;
type ChangeVolumeParams = z.infer<typeof validations.audio.changeVolume.runtime.schema>;
type GetInfoParams = z.infer<typeof validations.audio.getInfo.runtime.schema>;
type NormalizeParams = z.infer<typeof validations.audio.normalize.runtime.schema>;
type SaveParams = z.infer<typeof validations.audio.export.runtime.schema>;
type ExportParams = z.infer<typeof validations.audio.export.runtime.schema>;
type FadeInParams = z.infer<typeof validations.audio.fadeIn.runtime.schema>;
type FadeOutParams = z.infer<typeof validations.audio.fadeOut.runtime.schema>;
type ChangeSpeedParams = z.infer<typeof validations.audio.changeSpeed.runtime.schema>;
type AddSilenceParams = z.infer<typeof validations.audio.addSilence.runtime.schema>;
type MixAudioParams = z.infer<typeof validations.audio.mixAudio.runtime.schema>;

/**
 * @group Actions
 */
export class GroupAudio {
  // --------------------------------------------------
  // Load
  // --------------------------------------------------

  /**
   * Loads an audio file into an Audio object for further processing.
   *
   * @param params - The input parameters.
   * @returns An Audio instance pointing to the given input file.
   * @example
   * ```yaml
   * # Load an audio file to begin an editing pipeline
   * - group: audio
   *   name: load
   *   params:
   *     input: '/recordings/interview.mp3'
   * ```
   */
  static async load(params: LoadParams): Promise<Audio> {
    const { input } = validations.audio.load.runtime.validate(params);
    const audio = new Audio();
    audio.input = input;
    return audio;
  }

  // --------------------------------------------------
  // Conversion & Encoding
  // --------------------------------------------------

  /**
   * Queues a format conversion to be applied when the audio is exported.
   *
   * @param params - The input parameters.
   * @returns The updated Audio instance with the target format queued.
   * @example
   * ```yaml
   * # Convert an MP3 to WAV before processing with an external tool
   * - group: audio
   *   name: convertFormat
   *   params:
   *     audio: '{{ audio }}'
   *     format: 'wav'
   * ```
   */
  static async convertFormat(params: ConvertFormatParams): Promise<Audio> {
    const { audio, format } = validations.audio.convertFormat.runtime.validate(params);
    audio.suffixOptions = audio.suffixOptions.filter(([flag]) => flag !== '-f');
    audio.suffixOptions.push(['-f', format]);
    audio.format = format;
    return audio;
  }

  /**
   * Queues a bitrate constraint to reduce the audio file size on export.
   *
   * @param params - The input parameters.
   * @returns The updated Audio instance with the bitrate limit queued.
   * @example
   * ```yaml
   * # Compress a podcast episode to 96k for web delivery
   * - group: audio
   *   name: compress
   *   params:
   *     audio: '{{ audio }}'
   *     bitrate: '96k'
   * ```
   */
  static async compress(params: CompressParams): Promise<Audio> {
    const { audio, bitrate } = validations.audio.compress.runtime.validate(params);
    audio.suffixOptions = audio.suffixOptions.filter(([flag]) => flag !== '-b:a');
    audio.suffixOptions.push(['-b:a', bitrate]);
    return audio;
  }

  // --------------------------------------------------
  // Editing
  // --------------------------------------------------

  /**
   * Queues a time-based trim to extract a segment from the audio on export.
   *
   * @param params - The input parameters.
   * @returns The updated Audio instance with the trim range queued.
   * @example
   * ```yaml
   * # Extract the first 30 seconds of an intro recording
   * - group: audio
   *   name: trim
   *   params:
   *     audio: '{{ audio }}'
   *     start: '00:00:00'
   *     duration: '00:00:30'
   * ```
   */
  static async trim(params: TrimParams): Promise<Audio> {
    const { audio, start, duration } = validations.audio.trim.runtime.validate(params);
    audio.suffixOptions = audio.suffixOptions.filter(([flag]) => flag !== '-ss');
    audio.suffixOptions.push(['-ss', String(start), '-t', String(duration)]);
    return audio;
  }

  /**
   * Concatenates one or more additional audio files onto the end of the current audio.
   *
   * The current audio state is written to a temp file first, then all inputs are joined
   * via ffmpeg's concat filter. The Audio instance is reset to point at the merged output.
   *
   * @param params - The input parameters.
   * @returns The updated Audio instance pointing at the concatenated result.
   * @example
   * ```yaml
   * # Join an intro jingle, a main recording, and an outro into one file
   * - group: audio
   *   name: concatenate
   *   params:
   *     audio: '{{ audio }}'
   *     inputs:
   *       - '/assets/intro.mp3'
   *       - '/assets/outro.mp3'
   * ```
   */
  static async concatenate(params: ConcatenateParams): Promise<Audio> {
    const { audio, inputs } = validations.audio.concatenate.runtime.validate(params);

    const ext = path.extname(audio.input) || '.mp3';

    const tempCurrent = audio.createTempFile(ext);
    await GroupAudio.save({ audio, output: tempCurrent });

    const tempOutput = audio.createTempFile(ext);

    const allInputs = [tempCurrent, ...inputs];

    const inputArgs = allInputs.flatMap((file) => ['-i', file]);
    const inputLabels = allInputs.map((_, i) => `[${i}:a]`).join('');
    const concatFilter = `${inputLabels}concat=n=${allInputs.length}:v=0:a=1[out]`;

    await runMediaTool('ffmpeg', ['-y', ...inputArgs, '-filter_complex', concatFilter, '-map', '[out]', tempOutput]);

    audio.reset(tempOutput);

    return audio;
  }

  /**
   * Queues a volume adjustment to be applied when the audio is exported.
   *
   * Accepts a multiplier (e.g. `0.5` for half volume, `2.0` for double) or a dB value
   * (e.g. `10dB`).
   *
   * @param params - The input parameters.
   * @returns The updated Audio instance with the volume filter queued.
   * @example
   * ```yaml
   * # Reduce volume to 80% before mixing with background music
   * - group: audio
   *   name: changeVolume
   *   params:
   *     audio: '{{ audio }}'
   *     volume: 0.8
   * ```
   */
  static async changeVolume(params: ChangeVolumeParams): Promise<Audio> {
    const { audio, volume } = validations.audio.changeVolume.runtime.validate(params);
    audio.audioFilters = audio.audioFilters.filter((f) => !f.startsWith('volume='));
    audio.audioFilters.push(`volume=${volume}`);
    return audio;
  }

  /**
   * Queues a fade-in effect to be applied when the audio is exported.
   *
   * @param params - The input parameters.
   * @returns The updated Audio instance with the fade-in filter queued.
   * @example
   * ```yaml
   * # Fade in over the first 2 seconds
   * - group: audio
   *   name: fadeIn
   *   params:
   *     audio: '{= audio =}'
   *     duration: 2
   * ```
   */
  static async fadeIn(params: FadeInParams): Promise<Audio> {
    const { audio, duration, start } = validations.audio.fadeIn.runtime.validate(params);
    audio.audioFilters = audio.audioFilters.filter((f) => !f.startsWith('afade=t=in'));
    audio.audioFilters.push(`afade=t=in:st=${start}:d=${duration}`);
    return audio;
  }

  /**
   * Queues a fade-out effect to be applied when the audio is exported.
   *
   * `start` is the timestamp (in seconds) in the audio where the fade begins.
   * For a 10-second clip with a 2-second fade at the end, use `start: 8, duration: 2`.
   *
   * @param params - The input parameters.
   * @returns The updated Audio instance with the fade-out filter queued.
   * @example
   * ```yaml
   * # Fade out over the last 3 seconds of a 30-second clip
   * - group: audio
   *   name: fadeOut
   *   params:
   *     audio: '{= audio =}'
   *     start: 27
   *     duration: 3
   * ```
   */
  static async fadeOut(params: FadeOutParams): Promise<Audio> {
    const { audio, duration, start } = validations.audio.fadeOut.runtime.validate(params);
    audio.audioFilters = audio.audioFilters.filter((f) => !f.startsWith('afade=t=out'));
    audio.audioFilters.push(`afade=t=out:st=${start}:d=${duration}`);
    return audio;
  }

  /**
   * Queues a pitch-preserving speed change to be applied when the audio is exported.
   *
   * Uses ffmpeg's `atempo` filter (range 0.5–2.0 per stage). For speeds outside that
   * range, multiple atempo stages are chained automatically — e.g. 3.0x becomes
   * `atempo=2.0,atempo=1.5`.
   *
   * @param params - The input parameters.
   * @returns The updated Audio instance with the speed filter(s) queued.
   * @example
   * ```yaml
   * # Speed up audio 1.5x without changing pitch
   * - group: audio
   *   name: changeSpeed
   *   params:
   *     audio: '{= audio =}'
   *     speed: 1.5
   * ```
   */
  static async changeSpeed(params: ChangeSpeedParams): Promise<Audio> {
    const { audio, speed } = validations.audio.changeSpeed.runtime.validate(params);

    audio.audioFilters = audio.audioFilters.filter((f) => !f.startsWith('atempo='));

    const stages: string[] = [];
    let remaining = speed;
    while (remaining > 2.0) {
      stages.push('atempo=2.0');
      remaining /= 2.0;
    }
    while (remaining < 0.5) {
      stages.push('atempo=0.5');
      remaining /= 0.5;
    }
    stages.push(`atempo=${remaining.toFixed(4)}`);

    audio.audioFilters.push(...stages);
    return audio;
  }

  /**
   * Queues silence padding at the start or end of the audio to be applied on export.
   *
   * Calling with `position: 'start'` and `position: 'end'` independently queues both.
   * Calling the same position twice overrides the previous value.
   *
   * @param params - The input parameters.
   * @returns The updated Audio instance with the silence filter queued.
   * @example
   * ```yaml
   * # Add 1 second of silence before the audio begins
   * - group: audio
   *   name: addSilence
   *   params:
   *     audio: '{= audio =}'
   *     duration: 1
   *     position: start
   * ```
   */
  static async addSilence(params: AddSilenceParams): Promise<Audio> {
    const { audio, duration, position } = validations.audio.addSilence.runtime.validate(params);

    if (position === 'start') {
      const ms = Math.round(duration * 1000);
      audio.audioFilters = audio.audioFilters.filter((f) => !f.startsWith('adelay='));
      audio.audioFilters.push(`adelay=${ms}:all=1`);
    } else {
      audio.audioFilters = audio.audioFilters.filter((f) => !f.startsWith('apad='));
      audio.audioFilters.push(`apad=pad_dur=${duration}`);
    }

    return audio;
  }

  /**
   * Overlays a second audio track onto the current audio and resets the pipeline state.
   *
   * This is an eager operation — like `concatenate`, it flushes all queued operations
   * to a temp file first, then runs the mix. The Audio instance is reset to point at
   * the mixed result with a clean queue.
   *
   * `volume` controls the level of the mixed-in track (default `1.0`). The main track
   * always plays at full volume.
   *
   * @param params - The input parameters.
   * @returns The updated Audio instance pointing at the mixed output.
   * @example
   * ```yaml
   * # Overlay background music at 30% volume under a voice recording
   * - group: audio
   *   name: mixAudio
   *   params:
   *     audio: '{= audio =}'
   *     input: '/assets/background.mp3'
   *     volume: 0.3
   * ```
   */
  static async mixAudio(params: MixAudioParams): Promise<Audio> {
    const { audio, input, volume } = validations.audio.mixAudio.runtime.validate(params);

    const ext = path.extname(audio.input) || '.mp3';
    const tempCurrent = audio.createTempFile(ext);
    await GroupAudio.save({ audio, output: tempCurrent });

    const tempOutput = audio.createTempFile(ext);

    const mixFilter =
      volume !== undefined
        ? `[0:a]volume=1[main];[1:a]volume=${volume}[bg];[main][bg]amix=inputs=2:duration=first[out]`
        : `[0:a][1:a]amix=inputs=2:duration=first[out]`;

    await runMediaTool('ffmpeg', [
      '-y',
      '-i',
      tempCurrent,
      '-i',
      input,
      '-filter_complex',
      mixFilter,
      '-map',
      '[out]',
      tempOutput,
    ]);
    audio.reset(tempOutput);
    return audio;
  }

  // --------------------------------------------------
  // Analysis
  // --------------------------------------------------

  /**
   * Returns format and stream metadata for the audio file using ffprobe.
   *
   * The current audio state is written to a temp file before probing so that any
   * queued operations are reflected in the reported metadata.
   *
   * @param params - The input parameters.
   * @returns A parsed JSON object containing format and stream details.
   * @example
   * ```yaml
   * # Read duration and codec info before deciding whether to transcode
   * - group: audio
   *   name: getInfo
   *   params:
   *     audio: '{{ audio }}'
   * ```
   */
  static async getInfo(params: GetInfoParams): Promise<any> {
    const { audio } = validations.audio.getInfo.runtime.validate(params);
    const stdout = await runMediaTool('ffprobe', [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      fileArg(audio.input),
    ]);
    return JSON.parse(stdout);
  }

  /**
   * Queues an EBU R128 loudness normalization filter to be applied on export.
   *
   * @param params - The input parameters.
   * @returns The updated Audio instance with the loudnorm filter queued.
   * @example
   * ```yaml
   * # Normalize loudness before publishing a podcast episode
   * - group: audio
   *   name: normalize
   *   params:
   *     audio: '{{ audio }}'
   * ```
   */
  static async normalize(params: NormalizeParams): Promise<Audio> {
    const { audio } = validations.audio.normalize.runtime.validate(params);
    audio.audioFilters = audio.audioFilters.filter((f) => f !== 'loudnorm');
    audio.audioFilters.push('loudnorm');
    return audio;
  }

  // --------------------------------------------------
  // Save and Apply
  // --------------------------------------------------

  /**
   * Writes the current audio state to disk, applying all queued filters and options.
   *
   * Use this when you need an intermediate file during a pipeline (e.g., before
   * concatenating). For the final output that also cleans up temp files, use `export`.
   *
   * @param params - The input parameters.
   * @returns A promise that resolves when the file has been written.
   * @example
   * ```yaml
   * # Save the processed audio to an intermediate path
   * - group: audio
   *   name: save
   *   params:
   *     audio: '{{ audio }}'
   *     output: '/tmp/step1-processed.mp3'
   * ```
   */
  static async save(params: SaveParams): Promise<void> {
    const { audio, output } = validations.audio.export.runtime.validate(params);
    fs.mkdirSync(path.dirname(output), { recursive: true });

    const outputExt = path.extname(output).replace('.', '').toLowerCase();
    if (audio.format) {
      if (outputExt && audio.format !== outputExt) {
        throw new Error(
          `Error: The output extension ".${outputExt}" does not match the specified format "${audio.format}".`
        );
      }
    }

    const args = ['-y', ...audio.prefixOptions.flat(), '-i', audio.input];

    if (audio.audioFilters.length > 0) {
      args.push('-filter:a', audio.audioFilters.join(','));
    }

    args.push(...audio.suffixOptions.flat(), fileArg(output));

    await runMediaTool('ffmpeg', args);
  }

  /**
   * Writes the final audio output to disk and deletes all temporary files created
   * during the pipeline.
   *
   * This is the intended last step in any audio pipeline. For intermediate saves that
   * keep the pipeline alive, use `save`.
   *
   * @param params - The input parameters.
   * @returns A promise that resolves when the file has been written and temps cleaned up.
   * @example
   * ```yaml
   * # Export the finished audio and clean up all temp files
   * - group: audio
   *   name: export
   *   params:
   *     audio: '{{ audio }}'
   *     output: '/output/final-episode.mp3'
   * ```
   */
  static async export(params: ExportParams): Promise<void> {
    const { audio } = validations.audio.export.runtime.validate(params);
    await GroupAudio.save(params);
    audio.cleanup();
  }
}
