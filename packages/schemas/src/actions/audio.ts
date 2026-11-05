import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { audioSchema } from '@tipeline/types';
import { orTemplateString } from './../templateValidation';

const stringPath = () => z.string().min(1);

export const meta = {
  label: 'Audio',
  icon: 'AudioLines'
}

export const validations = {
  load: createValidationPair(
    {
      runtime: z.object({ input: stringPath() }),
      creation: z.object({ input: stringPath() }),
    },
    {
      label: 'Load Audio', icon: '📥', category: 'io', description: 'Load audio from a path or URL.',
      returns: 'audio',
      fieldConfig: {
        input: { description: 'File path or URL of the audio to load.' },
      },
    }
  ),

  export: createValidationPair(
    {
      runtime: z.object({ audio: audioSchema, output: stringPath() }),
      creation: z.object({ audio: stringPath(), output: stringPath() }),
    },
    {
      label: 'Export Audio', icon: '💾', category: 'io', description: 'Write audio to a file.',
      fieldConfig: {
        audio: { description: 'The audio object to export.' },
        output: { description: 'Destination file path (e.g. /output/final.mp3).' },
      },
    }
  ),

  // --------------------------------------------------
  // Conversion & Encoding
  // --------------------------------------------------
  convertFormat: createValidationPair(
    {
      runtime: z.object({
        audio: audioSchema,
        format: z.enum([
          'mp3',
          'aac',
          'flac',
          'wav',
          'ogg',
          'opus',
          'ac3',
          'ipod', // m4a
          'adts',
          'alaw',
          'mulaw',
        ]),
      }),
      creation: z.object({
        audio: stringPath(),
        format: orTemplateString(z.enum([
          'mp3',
          'aac',
          'flac',
          'wav',
          'ogg',
          'opus',
          'ac3',
          'ipod',
          'adts',
          'alaw',
          'mulaw',
        ])),
      }),
    },
    {
      label: 'Convert Format', icon: '🔄', category: 'conversion', description: 'Transcode audio to a different format.',
      returns: 'audio',
      fieldConfig: {
        audio: { description: 'The audio object to transcode.' },
        format: { description: 'Target output format.' },
      },
    }
  ),

  compress: createValidationPair(
    {
      runtime: z.object({
        audio: audioSchema,
        bitrate: stringPath(), // e.g., '64k'
      }),
      creation: z.object({
        audio: stringPath(),
        bitrate: stringPath(),
      }),
    },
    {
      label: 'Compress', icon: '🗜️', category: 'conversion', description: 'Reduce size by targeting a bitrate.',
      returns: 'audio',
      fieldConfig: {
        audio: { description: 'The audio object to compress.' },
        bitrate: { description: 'Target bitrate (e.g. 64k, 128k, 320k).' },
      },
    }
  ),

  // --------------------------------------------------
  // Editing
  // --------------------------------------------------
  trim: createValidationPair(
    {
      runtime: z.object({
        audio: audioSchema,
        start: stringPath(),    // 'HH:MM:SS[.ms]'
        duration: stringPath(), // 'HH:MM:SS[.ms]'
      }),
      creation: z.object({
        audio: stringPath(),
        start: stringPath(),
        duration: stringPath(),
      }),
    },
    {
      label: 'Trim', icon: '✂️', category: 'editing', description: 'Cut a segment from the audio.',
      returns: 'audio',
      fieldConfig: {
        audio: { description: 'The audio object to trim.' },
        start: { description: 'Start timestamp of the segment (HH:MM:SS or HH:MM:SS.ms).' },
        duration: { description: 'Length of the segment to keep (HH:MM:SS or HH:MM:SS.ms).' },
      },
    }
  ),

  concatenate: createValidationPair(
    {
      runtime: z.object({
        audio: audioSchema,
        inputs: z.array(z.string()).min(1),
      }),
      creation: z.object({
        audio: stringPath(),
        inputs: orTemplateString(z.array(z.string())),
      }),
    },
    {
      label: 'Concatenate', icon: '➕', category: 'editing', description: 'Append multiple sources to an audio base.',
      returns: 'audio',
      fieldConfig: {
        audio: { description: 'The base audio object to append onto.' },
        inputs: { description: 'List of file paths to append in order.' },
      },
    }
  ),

  changeVolume: createValidationPair(
    {
      runtime: z.object({
        audio: audioSchema,
        volume: z.number(), // e.g., 0.5
      }),
      creation: z.object({
        audio: stringPath(),
        volume: orTemplateString(z.number()),
      }),
    },
    {
      label: 'Change Volume', icon: '🔊', category: 'editing', description: 'Scale the audio volume.',
      returns: 'audio',
      fieldConfig: {
        audio: { description: 'The audio object to adjust.' },
        volume: { description: 'Volume multiplier (e.g. 0.5 = half, 2.0 = double).' },
      },
    }
  ),

  fadeIn: createValidationPair(
    {
      runtime: z.object({
        audio: audioSchema,
        duration: z.number().positive(),   // seconds
        start: z.number().min(0).default(0),
      }),
      creation: z.object({
        audio: stringPath(),
        duration: orTemplateString(z.number().positive()),
        start: orTemplateString(z.number().min(0)).optional(),
      }),
    },
    {
      label: 'Fade In', icon: '📈', category: 'editing', description: 'Apply a fade-in effect.',
      returns: 'audio',
      fieldConfig: {
        audio: { description: 'The audio object to apply the fade to.' },
        duration: { description: 'Length of the fade in seconds.' },
        start: { description: 'Timestamp (seconds) where the fade begins. Defaults to 0.' },
      },
    }
  ),

  fadeOut: createValidationPair(
    {
      runtime: z.object({
        audio: audioSchema,
        duration: z.number().positive(),   // seconds
        start: z.number().min(0),          // timestamp in the audio where fade begins
      }),
      creation: z.object({
        audio: stringPath(),
        duration: orTemplateString(z.number().positive()),
        start: orTemplateString(z.number().min(0)),
      }),
    },
    {
      label: 'Fade Out', icon: '📉', category: 'editing', description: 'Apply a fade-out effect.',
      returns: 'audio',
      fieldConfig: {
        audio: { description: 'The audio object to apply the fade to.' },
        duration: { description: 'Length of the fade in seconds.' },
        start: { description: 'Timestamp (seconds) in the audio where the fade begins.' },
      },
    }
  ),

  changeSpeed: createValidationPair(
    {
      runtime: z.object({
        audio: audioSchema,
        speed: z.number().min(0.25).max(4.0), // pitch-preserving via atempo
      }),
      creation: z.object({
        audio: stringPath(),
        speed: orTemplateString(z.number().min(0.25).max(4.0)),
      }),
    },
    {
      label: 'Change Speed', icon: '⏩', category: 'editing', description: 'Adjust playback speed without changing pitch.',
      returns: 'audio',
      fieldConfig: {
        audio: { description: 'The audio object to speed up or slow down.' },
        speed: { description: 'Speed multiplier between 0.25 and 4.0 (1.0 = original speed).' },
      },
    }
  ),

  addSilence: createValidationPair(
    {
      runtime: z.object({
        audio: audioSchema,
        duration: z.number().positive(),   // seconds
        position: z.enum(['start', 'end']),
      }),
      creation: z.object({
        audio: stringPath(),
        duration: orTemplateString(z.number().positive()),
        position: orTemplateString(z.enum(['start', 'end'])),
      }),
    },
    {
      label: 'Add Silence', icon: '⏸️', category: 'editing', description: 'Pad the audio with silence at the start or end.',
      returns: 'audio',
      fieldConfig: {
        audio: { description: 'The audio object to pad.' },
        duration: { description: 'Duration of silence to add in seconds.' },
        position: { description: 'Where to insert the silence: at the start or end.' },
      },
    }
  ),

  mixAudio: createValidationPair(
    {
      runtime: z.object({
        audio: audioSchema,
        input: stringPath(),
        volume: z.number().positive().optional(), // volume multiplier for the mixed-in track
      }),
      creation: z.object({
        audio: stringPath(),
        input: stringPath(),
        volume: orTemplateString(z.number().positive()).optional(),
      }),
    },
    {
      label: 'Mix Audio', icon: '🎛️', category: 'editing', description: 'Overlay a second audio track onto the main audio.',
      returns: 'audio',
      fieldConfig: {
        audio: { description: 'The base audio object to mix onto.' },
        input: { description: 'File path of the audio track to overlay.' },
        volume: { description: 'Volume of the overlaid track (default 1.0). The base track is always at full volume.' },
      },
    }
  ),

  // --------------------------------------------------
  // Analysis
  // --------------------------------------------------
  getInfo: createValidationPair(
    {
      runtime: z.object({ audio: audioSchema }),
      creation: z.object({ audio: stringPath() }),
    },
    {
      label: 'Get Info', icon: 'ℹ️', category: 'analysis', description: 'Probe metadata and stream details.',
      returns: 'object',
      fieldConfig: {
        audio: { description: 'The audio object to probe.' },
      },
    }
  ),

  normalize: createValidationPair(
    {
      runtime: z.object({ audio: audioSchema }),
      creation: z.object({ audio: stringPath() }),
    },
    {
      label: 'Normalize', icon: '🎚️', category: 'analysis', description: 'Normalize loudness/peaks.',
      returns: 'audio',
      fieldConfig: {
        audio: { description: 'The audio object to normalize.' },
      },
    }
  ),
};
