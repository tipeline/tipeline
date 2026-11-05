import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { videoSchema } from '@tipeline/types';

const videoId = () => z.string().min(1);

export const meta = {
  label: 'Video',
  icon: 'Video'
}

export const validations = {
  // --------------------------------------------------
  // I/O
  // --------------------------------------------------
  load: createValidationPair(
    {
      runtime: z.object({ input: z.string().min(1) }),
      creation: z.object({ input: z.string().min(1) }),
    },
    {
      label: 'Load Video', icon: '📥', category: 'video', description: 'Load a video from a path or URL.',
      returns: 'video',
      fieldConfig: { input: { description: 'File path or URL of the video to load.' } },
    }
  ),

  export: createValidationPair(
    {
      runtime: z.object({ video: videoSchema, output: z.string().min(1) }),
      creation: z.object({ video: videoId(), output: z.string().min(1) }),
    },
    {
      label: 'Export Video', icon: '💾', category: 'video', description: 'Write the video to a file.',
      fieldConfig: {
        video: { description: 'The video object to export.' },
        output: { description: 'Destination file path for the exported video.' },
      },
    }
  ),

  // --------------------------------------------------
  // Editing & Transformation
  // --------------------------------------------------
  trim: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        start: z.string().min(1),
        duration: z.string().min(1),
      }),
      creation: z.object({
        video: videoId(),
        start: z.string().min(1),
        duration: z.string().min(1),
      }),
    },
    {
      label: 'Trim', icon: '✂️', category: 'edit', description: 'Cut a segment from the video.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The video object to trim.' },
        start: { description: 'Start timestamp of the segment (HH:MM:SS or HH:MM:SS.ms).' },
        duration: { description: 'Duration of the segment to keep (HH:MM:SS or HH:MM:SS.ms).' },
      },
    }
  ),

  changeResolution: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
      creation: z.object({
        video: videoId(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
      }),
    },
    {
      label: 'Change Resolution', icon: '📐', category: 'edit', description: 'Resize video canvas.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The video object to resize.' },
        width: { description: 'Target width in pixels.' },
        height: { description: 'Target height in pixels.' },
      },
    }
  ),

  crop: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
      }),
      creation: z.object({
        video: videoId(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        x: z.number().int().nonnegative(),
        y: z.number().int().nonnegative(),
      }),
    },
    {
      label: 'Crop', icon: '✂️', category: 'edit', description: 'Crop to a rectangle.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The video object to crop.' },
        width: { description: 'Width of the crop area in pixels.' },
        height: { description: 'Height of the crop area in pixels.' },
        x: { description: 'Horizontal offset from the left edge in pixels.' },
        y: { description: 'Vertical offset from the top edge in pixels.' },
      },
    }
  ),

  rotate: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        transpose: z.enum(['0', '1', '2', '3']),
      }),
      creation: z.object({
        video: videoId(),
        transpose: z.enum(['0', '1', '2', '3']),
      }),
    },
    {
      label: 'Rotate', icon: '🌀', category: 'edit', description: 'Rotate using transpose filter.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The video object to rotate.' },
        transpose: { description: 'Transpose mode: 0=90°CCW+flip, 1=90°CW, 2=90°CCW, 3=90°CW+flip.' },
      },
    }
  ),

  changeFramerate: createValidationPair(
    {
      runtime: z.object({ video: videoSchema, fps: z.number().int().positive() }),
      creation: z.object({ video: videoId(), fps: z.number().int().positive() }),
    },
    {
      label: 'Change Framerate', icon: '🎞️', category: 'edit', description: 'Adjust frames per second.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The video object to change the frame rate of.' },
        fps: { description: 'Target frames per second.' },
      },
    }
  ),

  changeVolume: createValidationPair(
    {
      runtime: z.object({ video: videoSchema, volume: z.number().positive() }),
      creation: z.object({ video: videoId(), volume: z.number().positive() }),
    },
    {
      label: 'Change Volume', icon: '🔊', category: 'audio', description: 'Scale the audio volume.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The video object to adjust audio volume for.' },
        volume: { description: 'Volume multiplier (e.g. 0.5 = half, 2.0 = double).' },
      },
    }
  ),

  mute: createValidationPair(
    {
      runtime: z.object({ video: videoSchema }),
      creation: z.object({ video: videoId() }),
    },
    {
      label: 'Mute', icon: '🔇', category: 'audio', description: 'Remove the audio track.',
      returns: 'video',
      fieldConfig: { video: { description: 'The video object to mute.' } },
    }
  ),

  replaceAudio: createValidationPair(
    {
      runtime: z.object({ video: videoSchema, audio: z.string().min(1) }),
      creation: z.object({ video: videoId(), audio: z.string().min(1) }),
    },
    {
      label: 'Replace Audio', icon: '🎙️', category: 'audio', description: 'Replace audio with an external track.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The video object to replace the audio of.' },
        audio: { description: 'File path of the audio track to use as replacement.' },
      },
    }
  ),

  addBackgroundMusic: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        music: z.string().min(1),
        musicVolume: z.number().positive().optional(),
      }),
      creation: z.object({
        video: videoId(),
        music: z.string().min(1),
        musicVolume: z.number().positive().optional(),
      }),
    },
    {
      label: 'Add BGM', icon: '🎵', category: 'audio', description: 'Mix background music into the video.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The video object to add background music to.' },
        music: { description: 'File path of the background music audio track.' },
        musicVolume: { description: 'Volume of the background music track (default 1.0).' },
      },
    }
  ),

  // --------------------------------------------------
  // Conversion & Compression
  // --------------------------------------------------
  convertFormat: createValidationPair(
    {
      runtime: z.object({ video: videoSchema, format: z.string().min(1) }),
      creation: z.object({ video: videoId(), format: z.string().min(1) }),
    },
    {
      label: 'Convert Format', icon: '🔄', category: 'convert', description: 'Transcode video to a new format.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The video object to transcode.' },
        format: { description: 'Target container format (e.g. "mp4", "webm", "mov").' },
      },
    }
  ),

  compress: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        crf: z.number().min(0).max(51),
        preset: z.enum([
          'ultrafast',
          'superfast',
          'veryfast',
          'faster',
          'fast',
          'medium',
          'slow',
          'slower',
          'veryslow',
        ]),
      }),
      creation: z.object({
        video: videoId(),
        crf: z.number().min(0).max(51),
        preset: z.enum([
          'ultrafast',
          'superfast',
          'veryfast',
          'faster',
          'fast',
          'medium',
          'slow',
          'slower',
          'veryslow',
        ]),
      }),
    },
    {
      label: 'Compress', icon: '🗜️', category: 'convert', description: 'Reduce size via CRF/preset.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The video object to compress.' },
        crf: { description: 'Constant Rate Factor (0–51). Lower = better quality, higher = smaller file. Typical: 18–28.' },
        preset: { description: 'Encoding speed preset (ultrafast to veryslow). Slower presets yield better compression.' },
      },
    }
  ),

  // --------------------------------------------------
  // Composition & Overlay
  // --------------------------------------------------
  concatenateVideos: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        inputs: z.array(z.string().min(1)).min(1),
        resolution: z
          .object({
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          })
          .optional(),
      }),
      creation: z.object({
        video: videoId(),
        inputs: z.array(z.string().min(1)).min(1),
        resolution: z
          .object({
            width: z.number().int().positive(),
            height: z.number().int().positive(),
          })
          .optional(),
      }),
    },
    {
      label: 'Concatenate', icon: '➕🎬', category: 'compose', description: 'Append multiple videos in sequence.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The base video object to append to.' },
        inputs: { description: 'List of file paths of videos to append in order.' },
        resolution: { description: 'Optional output resolution to normalize all inputs to (width and height).' },
      },
    }
  ),

  addOverlay: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        overlay: z.string().min(1),
        x: z.number().int().nonnegative().optional(),
        y: z.number().int().nonnegative().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
      creation: z.object({
        video: videoId(),
        overlay: z.string().min(1),
        x: z.number().int().nonnegative().optional(),
        y: z.number().int().nonnegative().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    },
    {
      label: 'Add Overlay', icon: '🧩', category: 'compose', description: 'Overlay an image/video onto the base.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The base video object.' },
        overlay: { description: 'File path of the image or video to overlay.' },
        x: { description: 'Horizontal position of the overlay in pixels (default 0).' },
        y: { description: 'Vertical position of the overlay in pixels (default 0).' },
        width: { description: 'Width to scale the overlay to in pixels (optional).' },
        height: { description: 'Height to scale the overlay to in pixels (optional).' },
      },
    }
  ),

  addWatermark: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        image: z.string().min(1),
        x: z.number().int().nonnegative().optional(),
        y: z.number().int().nonnegative().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
      creation: z.object({
        video: videoId(),
        image: z.string().min(1),
        x: z.number().int().nonnegative().optional(),
        y: z.number().int().nonnegative().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      }),
    },
    {
      label: 'Watermark', icon: '💧', category: 'compose', description: 'Add an image watermark.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The base video object.' },
        image: { description: 'File path of the watermark image.' },
        x: { description: 'Horizontal position of the watermark in pixels (default 0).' },
        y: { description: 'Vertical position of the watermark in pixels (default 0).' },
        width: { description: 'Width to scale the watermark to in pixels (optional).' },
        height: { description: 'Height to scale the watermark to in pixels (optional).' },
      },
    }
  ),

  addSubtitles: createValidationPair(
    {
      runtime: z.object({ video: videoSchema, subtitle: z.string().min(1) }),
      creation: z.object({ video: videoId(), subtitle: z.string().min(1) }),
    },
    {
      label: 'Add Subtitles', icon: '💬', category: 'compose', description: 'Burn-in or attach subtitles.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The video object to add subtitles to.' },
        subtitle: { description: 'File path to the subtitle file (e.g. .srt or .ass).' },
      },
    }
  ),

  // --------------------------------------------------
  // Analysis & Metadata
  // --------------------------------------------------
  getInfo: createValidationPair(
    {
      runtime: z.object({ video: videoSchema }),
      creation: z.object({ video: videoId() }),
    },
    {
      label: 'Get Info', icon: 'ℹ️', category: 'analysis', description: 'Probe metadata and stream details.',
      returns: 'object',
      fieldConfig: { video: { description: 'The video object to probe.' } },
    }
  ),

  getDuration: createValidationPair(
    {
      runtime: z.object({ video: videoSchema }),
      creation: z.object({ video: videoId() }),
    },
    {
      label: 'Get Duration', icon: '⏱️', category: 'analysis', description: 'Get total video duration.',
      returns: 'number',
      fieldConfig: { video: { description: 'The video object to get duration from.' } },
    }
  ),

  getThumbnail: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        output: z.string().min(1),
        timestamp: z.string().min(1),
      }),
      creation: z.object({
        video: videoId(),
        output: z.string().min(1),
        timestamp: z.string().min(1),
      }),
    },
    {
      label: 'Thumbnail', icon: '🖼️', category: 'analysis', description: 'Extract a frame to an image file.',
      fieldConfig: {
        video: { description: 'The video object to extract a frame from.' },
        output: { description: 'Destination file path for the thumbnail image.' },
        timestamp: { description: 'Timestamp of the frame to capture (HH:MM:SS or HH:MM:SS.ms).' },
      },
    }
  ),

  // --------------------------------------------------
  // Extraction & Output
  // --------------------------------------------------
  extractFrames: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        outputDir: z.string(),
        fps: z.number().min(1),
        format: z.enum(['png', 'jpg', 'bmp']).optional(),
        start: z.string().optional(),
        end: z.string().optional(),
      }),
      creation: z.object({
        video: videoId(),
        outputDir: z.string(),
        fps: z.number().min(1),
        format: z.enum(['png', 'jpg', 'bmp']).optional(),
        start: z.string().optional(),
        end: z.string().optional(),
      }),
    },
    {
      label: 'Extract Frames', icon: '🧩🎞️', category: 'export', description: 'Export frames to images.',
      fieldConfig: {
        video: { description: 'The video object to extract frames from.' },
        outputDir: { description: 'Directory where frame images will be saved.' },
        fps: { description: 'Number of frames per second to extract.' },
        format: { description: 'Image format for extracted frames: png, jpg, or bmp.' },
        start: { description: 'Start timestamp for frame extraction (optional).' },
        end: { description: 'End timestamp for frame extraction (optional).' },
      },
    }
  ),

  extractAudio: createValidationPair(
    {
      runtime: z.object({ video: videoSchema, output: z.string().min(1) }),
      creation: z.object({ video: videoId(), output: z.string().min(1) }),
    },
    {
      label: 'Extract Audio', icon: '🎧', category: 'export', description: 'Demux or transcode audio to a file.',
      fieldConfig: {
        video: { description: 'The video object to extract audio from.' },
        output: { description: 'Destination file path for the extracted audio.' },
      },
    }
  ),

  generateGif: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        output: z.string(),
        start: z.string().min(1),
        duration: z.string().min(1),
        fps: z.number().int().positive().optional(),
        width: z.number().int().positive().optional(),
      }),
      creation: z.object({
        video: videoId(),
        output: z.string(),
        start: z.string().min(1),
        duration: z.string().min(1),
        fps: z.number().int().positive().optional(),
        width: z.number().int().positive().optional(),
      }),
    },
    {
      label: 'Generate GIF', icon: '🖼️', category: 'export', description: 'Create an animated GIF from a segment.',
      fieldConfig: {
        video: { description: 'The video object to create a GIF from.' },
        output: { description: 'Destination file path for the GIF.' },
        start: { description: 'Start timestamp of the segment (HH:MM:SS).' },
        duration: { description: 'Duration of the GIF segment (HH:MM:SS).' },
        fps: { description: 'Frame rate for the GIF (optional).' },
        width: { description: 'Width of the GIF in pixels (optional, maintains aspect ratio).' },
      },
    }
  ),

  // --------------------------------------------------
  // Privacy & Compliance
  // --------------------------------------------------
  blurRegion: createValidationPair(
    {
      runtime: z.object({
        video: videoSchema,
        regions: z.array(
          z.object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
            start: z.number(),
            end: z.number(),
            blurStrength: z.number().optional(),
          })
        ),
      }),
      creation: z.object({
        video: videoId(),
        regions: z.array(
          z.object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
            start: z.number(),
            end: z.number(),
            blurStrength: z.number().optional(),
          })
        ),
      }),
    },
    {
      label: 'Blur Region', icon: '🕶️', category: 'privacy', description: 'Blur rectangular regions over time.',
      returns: 'video',
      fieldConfig: {
        video: { description: 'The video object to apply blur regions to.' },
        regions: { description: 'Array of region definitions with x, y, width, height, start/end times, and optional blur strength.' },
      },
    }
  ),
};
