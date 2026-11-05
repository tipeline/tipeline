import { z } from 'zod';
import { createValidationPair } from './../createValidation';
import { imageSchema } from '@tipeline/types';

const imgId = () => z.string().min(1);
const fmtEnum = z.enum(['jpeg', 'png', 'webp', 'tiff', 'avif', 'gif', 'heif']);

export const meta = {
  label: 'Image',
  icon: 'Image'
}

export const validations = {
  // ----------------------------------------
  // I/O
  // ----------------------------------------
  load: createValidationPair(
    {
      runtime: z.object({ path: z.string().min(1) }),
      creation: z.object({ path: z.string().min(1) }),
    },
    {
      label: 'Load Image', icon: '📥', category: 'image', description: 'Load an image from disk.',
      returns: 'image',
      fieldConfig: { path: { description: 'File path of the image to load.' } },
    }
  ),

  // ----------------------------------------
  // Transform
  // ----------------------------------------
  resize: createValidationPair(
    {
      runtime: z.object({
        image: imageSchema,
        width: z.number().min(1).optional(),
        height: z.number().min(1).optional(),
      }),
      creation: z.object({
        image: imgId(),
        width: z.number().min(1).optional(),
        height: z.number().min(1).optional(),
      }),
    },
    {
      label: 'Resize', icon: '📐', category: 'transform', description: 'Resize by width/height.',
      returns: 'image',
      fieldConfig: {
        image: { description: 'The image object to resize.' },
        width: { description: 'Target width in pixels (optional, preserves aspect ratio if only one dimension given).' },
        height: { description: 'Target height in pixels (optional, preserves aspect ratio if only one dimension given).' },
      },
    }
  ),

  rotate: createValidationPair(
    {
      runtime: z.object({ image: imageSchema, angle: z.number() }),
      creation: z.object({ image: imgId(), angle: z.number() }),
    },
    {
      label: 'Rotate', icon: '🌀', category: 'transform', description: 'Rotate by angle (degrees).',
      returns: 'image',
      fieldConfig: {
        image: { description: 'The image object to rotate.' },
        angle: { description: 'Rotation angle in degrees (clockwise).' },
      },
    }
  ),

  flip: createValidationPair(
    {
      runtime: z.object({ image: imageSchema }),
      creation: z.object({ image: imgId() }),
    },
    {
      label: 'Flip (Vertical)', icon: '↕️', category: 'transform', description: 'Flip vertically.',
      returns: 'image',
      fieldConfig: { image: { description: 'The image object to flip vertically.' } },
    }
  ),

  flop: createValidationPair(
    {
      runtime: z.object({ image: imageSchema }),
      creation: z.object({ image: imgId() }),
    },
    {
      label: 'Flop (Horizontal)', icon: '↔️', category: 'transform', description: 'Flip horizontally.',
      returns: 'image',
      fieldConfig: { image: { description: 'The image object to flip horizontally.' } },
    }
  ),

  crop: createValidationPair(
    {
      runtime: z.object({
        image: imageSchema,
        left: z.number(),
        top: z.number(),
        width: z.number(),
        height: z.number(),
      }),
      creation: z.object({
        image: imgId(),
        left: z.number(),
        top: z.number(),
        width: z.number(),
        height: z.number(),
      }),
    },
    {
      label: 'Crop', icon: '✂️', category: 'transform', description: 'Crop to a rectangle.',
      returns: 'image',
      fieldConfig: {
        image: { description: 'The image object to crop.' },
        left: { description: 'Left offset in pixels from the image origin.' },
        top: { description: 'Top offset in pixels from the image origin.' },
        width: { description: 'Width of the crop area in pixels.' },
        height: { description: 'Height of the crop area in pixels.' },
      },
    }
  ),

  grayscale: createValidationPair(
    {
      runtime: z.object({ image: imageSchema }),
      creation: z.object({ image: imgId() }),
    },
    {
      label: 'Grayscale', icon: '⚫️', category: 'transform', description: 'Convert to grayscale.',
      returns: 'image',
      fieldConfig: { image: { description: 'The image object to convert to grayscale.' } },
    }
  ),

  blur: createValidationPair(
    {
      runtime: z.object({ image: imageSchema, sigma: z.number().min(0.3).max(1000) }),
      creation: z.object({ image: imgId(), sigma: z.number().min(0.3).max(1000) }),
    },
    {
      label: 'Blur', icon: '🌫️', category: 'transform', description: 'Gaussian blur with sigma.',
      returns: 'image',
      fieldConfig: {
        image: { description: 'The image object to blur.' },
        sigma: { description: 'Blur radius (0.3–1000). Higher values produce stronger blur.' },
      },
    }
  ),

  sharpen: createValidationPair(
    {
      runtime: z.object({ image: imageSchema }),
      creation: z.object({ image: imgId() }),
    },
    {
      label: 'Sharpen', icon: '🧊', category: 'transform', description: 'Sharpen the image.',
      returns: 'image',
      fieldConfig: { image: { description: 'The image object to sharpen.' } },
    }
  ),

  negate: createValidationPair(
    {
      runtime: z.object({ image: imageSchema }),
      creation: z.object({ image: imgId() }),
    },
    {
      label: 'Invert', icon: '🔁', category: 'transform', description: 'Invert image colors.',
      returns: 'image',
      fieldConfig: { image: { description: 'The image object to invert colors on.' } },
    }
  ),

  tint: createValidationPair(
    {
      runtime: z.object({
        image: imageSchema,
        r: z.number().min(0).max(255),
        g: z.number().min(0).max(255),
        b: z.number().min(0).max(255),
      }),
      creation: z.object({
        image: imgId(),
        r: z.number().min(0).max(255),
        g: z.number().min(0).max(255),
        b: z.number().min(0).max(255),
      }),
    },
    {
      label: 'Tint', icon: '🎨', category: 'transform', description: 'Apply an RGB tint.',
      returns: 'image',
      fieldConfig: {
        image: { description: 'The image object to tint.' },
        r: { description: 'Red channel value (0–255).' },
        g: { description: 'Green channel value (0–255).' },
        b: { description: 'Blue channel value (0–255).' },
      },
    }
  ),

  modulate: createValidationPair(
    {
      runtime: z.object({
        image: imageSchema,
        brightness: z.number().optional(),
        saturation: z.number().optional(),
        hue: z.number().optional(),
      }),
      creation: z.object({
        image: imgId(),
        brightness: z.number().optional(),
        saturation: z.number().optional(),
        hue: z.number().optional(),
      }),
    },
    {
      label: 'Modulate', icon: '🎛️', category: 'transform', description: 'Adjust brightness, saturation, hue.',
      returns: 'image',
      fieldConfig: {
        image: { description: 'The image object to modulate.' },
        brightness: { description: 'Brightness multiplier (e.g. 1.5 = 50% brighter).' },
        saturation: { description: 'Saturation multiplier (e.g. 0.5 = half saturation).' },
        hue: { description: 'Hue rotation in degrees (0–360).' },
      },
    }
  ),

  // ----------------------------------------
  // Composition
  // ----------------------------------------
  composite: createValidationPair(
    {
      runtime: z.object({
        image: imageSchema,
        overlay: z.string().min(1),
        top: z.number().min(0).optional().default(0),
        left: z.number().min(0).optional().default(0),
      }),
      creation: z.object({
        image: imgId(),
        overlay: z.string().min(1),
        top: z.number().min(0).optional().default(0),
        left: z.number().min(0).optional().default(0),
      }),
    },
    {
      label: 'Composite', icon: '🧩', category: 'compose', description: 'Overlay another image at a position.',
      returns: 'image',
      fieldConfig: {
        image: { description: 'The base image object to composite onto.' },
        overlay: { description: 'File path of the image to overlay.' },
        top: { description: 'Vertical offset from the top of the base image (pixels).' },
        left: { description: 'Horizontal offset from the left of the base image (pixels).' },
      },
    }
  ),

  extend: createValidationPair(
    {
      runtime: z.object({
        image: imageSchema,
        top: z.number().min(0).default(0),
        bottom: z.number().min(0).default(0),
        left: z.number().min(0).default(0),
        right: z.number().min(0).default(0),
        background: z.string().min(1).default('#FFFFFF'),
      }),
      creation: z.object({
        image: imgId(),
        top: z.number().min(0).default(0),
        bottom: z.number().min(0).default(0),
        left: z.number().min(0).default(0),
        right: z.number().min(0).default(0),
        background: z.string().min(1).default('#FFFFFF'),
      }),
    },
    {
      label: 'Extend Canvas', icon: '🖼️', category: 'compose', description: 'Add borders with a background color.',
      returns: 'image',
      fieldConfig: {
        image: { description: 'The image object to extend.' },
        top: { description: 'Pixels to add to the top.' },
        bottom: { description: 'Pixels to add to the bottom.' },
        left: { description: 'Pixels to add to the left.' },
        right: { description: 'Pixels to add to the right.' },
        background: { description: 'Background fill color for the extended area (e.g. "#FFFFFF").' },
      },
    }
  ),

  // ----------------------------------------
  // Metadata
  // ----------------------------------------
  metadata: createValidationPair(
    {
      runtime: z.object({ image: imageSchema }),
      creation: z.object({ image: imgId() }),
    },
    {
      label: 'Metadata', icon: 'ℹ️', category: 'info',
      description:
        'Read image metadata: format, width, height, etc. Also exif, decoded from the original file, e.g. exif.DateTimeOriginal ("2026-05-14 14:30:12"), exif.Make, exif.Model, exif.GPSInfo. exif is missing when the file has none.',
      returns: 'object',
      fieldConfig: { image: { description: 'The image object to read metadata from.' } },
    }
  ),

  // ----------------------------------------
  // Format & Output
  // ----------------------------------------
  toFormat: createValidationPair(
    {
      runtime: z.object({ image: imageSchema, format: fmtEnum }),
      creation: z.object({ image: imgId(), format: fmtEnum }),
    },
    {
      label: 'To Format', icon: '🔄', category: 'output', description: 'Convert to a different image format.',
      returns: 'image',
      fieldConfig: {
        image: { description: 'The image object to convert.' },
        format: { description: 'Target format: jpeg, png, webp, tiff, avif, gif, or heif.' },
      },
    }
  ),

  toBuffer: createValidationPair(
    {
      runtime: z.object({ image: imageSchema, format: fmtEnum.optional() }),
      creation: z.object({ image: imgId(), format: fmtEnum.optional() }),
    },
    {
      label: 'To Buffer', icon: '📦', category: 'output', description: 'Render image into a base64-encoded string.',
      returns: 'string',
      fieldConfig: {
        image: { description: 'The image object to render.' },
        format: { description: 'Optional output format for the buffer (jpeg, png, webp, etc.).' },
      },
    }
  ),

  toFile: createValidationPair(
    {
      runtime: z.object({ image: imageSchema, output: z.string().min(1) }),
      creation: z.object({ image: imgId(), output: z.string().min(1) }),
    },
    {
      label: 'To File', icon: '💾', category: 'output', description: 'Write the image to a file path.',
      fieldConfig: {
        image: { description: 'The image object to write.' },
        output: { description: 'Destination file path (format inferred from extension).' },
      },
    }
  ),
};
