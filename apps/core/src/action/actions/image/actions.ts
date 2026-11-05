import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import sharp from 'sharp';
import exifReader from 'exif-reader';

import { validations } from '@tipeline/schemas';

type LoadParams = z.infer<typeof validations.image.load.runtime.schema>;
type ResizeParams = z.infer<typeof validations.image.resize.runtime.schema>;
type RotateParams = z.infer<typeof validations.image.rotate.runtime.schema>;
type FlipParams = z.infer<typeof validations.image.flip.runtime.schema>;
type FlopParams = z.infer<typeof validations.image.flop.runtime.schema>;
type CropParams = z.infer<typeof validations.image.crop.runtime.schema>;
type GrayscaleParams = z.infer<typeof validations.image.grayscale.runtime.schema>;
type BlurParams = z.infer<typeof validations.image.blur.runtime.schema>;
type SharpenParams = z.infer<typeof validations.image.sharpen.runtime.schema>;
type NegateParams = z.infer<typeof validations.image.negate.runtime.schema>;
type TintParams = z.infer<typeof validations.image.tint.runtime.schema>;
type ModulateParams = z.infer<typeof validations.image.modulate.runtime.schema>;
type CompositeParams = z.infer<typeof validations.image.composite.runtime.schema>;
type ExtendParams = z.infer<typeof validations.image.extend.runtime.schema>;
type MetadataParams = z.infer<typeof validations.image.metadata.runtime.schema>;
type ToFormatParams = z.infer<typeof validations.image.toFormat.runtime.schema>;
type ToBufferParams = z.infer<typeof validations.image.toBuffer.runtime.schema>;
type ToFileParams = z.infer<typeof validations.image.toFile.runtime.schema>;

/** Pads a number to two digits. */
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Turns a raw EXIF block into plain, pipeline-friendly tags: the main image and photo tags
 * at the top level, GPS under `GPSInfo`. Dates become `YYYY-MM-DD HH:mm:ss` (the camera clock;
 * exif-reader reads them as UTC so the digits stay as written) and binary values are dropped.
 */
function decodeExif(raw: Buffer): Record<string, unknown> | undefined {
  let parsed: ReturnType<typeof exifReader>;
  try {
    parsed = exifReader(raw);
  } catch {
    return undefined;
  }
  const clean = (tags: Record<string, unknown> | undefined) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tags ?? {})) {
      if (Buffer.isBuffer(value)) continue;
      if (value instanceof Date && isNaN(value.getTime())) continue;
      out[key] =
        value instanceof Date
          ? `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ` +
            `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`
          : value;
    }
    return out;
  };
  const exif: Record<string, unknown> = { ...clean(parsed.Image), ...clean(parsed.Photo) };
  if (parsed.GPSInfo) exif.GPSInfo = clean(parsed.GPSInfo);
  return exif;
}

/**
 * @group Actions
 */
export class GroupImage {
  // --------------------------------------------------
  // I/O
  // --------------------------------------------------

  /**
   * Loads an image from disk and returns a Sharp instance ready for chaining.
   *
   * @param params - The input parameters.
   * @returns A Sharp image instance.
   * @example
   * ```yaml
   * # Load a JPEG from disk — store the instance for use in subsequent image actions
   * - group: image
   *   name: load
   *   params:
   *     path: '{{ inputPath }}'
   *   destination: imageInstance
   * ```
   */
  static async load(params: LoadParams): Promise<any> {
    const { path } = validations.image.load.runtime.validate(params);
    return sharp(path);
  }

  // --------------------------------------------------
  // Transform
  // --------------------------------------------------

  /**
   * Resizes an image to the specified width and/or height.
   *
   * @param params - The input parameters.
   * @returns The resized image instance.
   * @example
   * ```yaml
   * # Resize to a fixed 800×600 thumbnail — useful for email attachments
   * - group: image
   *   name: resize
   *   params:
   *     image: '{= imageInstance =}'
   *     width: 800
   *     height: 600
   *   destination: imageInstance
   * ```
   */
  static async resize(params: ResizeParams): Promise<any> {
    const { image, width, height } = validations.image.resize.runtime.validate(params);
    image.resize(width, height);
    return image;
  }

  /**
   * Rotates an image by the given angle in degrees.
   *
   * @param params - The input parameters.
   * @returns The rotated image instance.
   * @example
   * ```yaml
   * # Rotate 90 degrees clockwise — corrects orientation from some camera scans
   * - group: image
   *   name: rotate
   *   params:
   *     image: '{= imageInstance =}'
   *     angle: 90
   *   destination: imageInstance
   * ```
   */
  static async rotate(params: RotateParams): Promise<any> {
    const { image, angle } = validations.image.rotate.runtime.validate(params);
    image.rotate(angle);
    return image;
  }

  /**
   * Flips an image vertically (top-to-bottom mirror).
   *
   * @param params - The input parameters.
   * @returns The flipped image instance.
   * @example
   * ```yaml
   * # Flip vertically — useful when source image is upside-down
   * - group: image
   *   name: flip
   *   params:
   *     image: '{= imageInstance =}'
   *   destination: imageInstance
   * ```
   */
  static async flip(params: FlipParams): Promise<any> {
    const { image } = validations.image.flip.runtime.validate(params);
    image.flip();
    return image;
  }

  /**
   * Flops an image horizontally (left-to-right mirror).
   *
   * @param params - The input parameters.
   * @returns The flopped image instance.
   * @example
   * ```yaml
   * # Flop horizontally — mirrors the image along the vertical axis
   * - group: image
   *   name: flop
   *   params:
   *     image: '{= imageInstance =}'
   *   destination: imageInstance
   * ```
   */
  static async flop(params: FlopParams): Promise<any> {
    const { image } = validations.image.flop.runtime.validate(params);
    image.flop();
    return image;
  }

  /**
   * Crops an image to the specified rectangle region.
   *
   * @param params - The input parameters.
   * @returns The cropped image instance.
   * @example
   * ```yaml
   * # Crop a 400×300 region starting at (100, 80) — extract a subject from a photo
   * - group: image
   *   name: crop
   *   params:
   *     image: '{= imageInstance =}'
   *     left: 100
   *     top: 80
   *     width: 400
   *     height: 300
   *   destination: imageInstance
   * ```
   */
  static async crop(params: CropParams): Promise<any> {
    const { image, left, top, width, height } = validations.image.crop.runtime.validate(params);
    image.extract({ left, top, width, height });
    return image;
  }

  // --------------------------------------------------
  // Appearance
  // --------------------------------------------------

  /**
   * Converts an image to grayscale.
   *
   * @param params - The input parameters.
   * @returns The grayscale image instance.
   * @example
   * ```yaml
   * # Convert to grayscale — useful for document scans or receipt images
   * - group: image
   *   name: grayscale
   *   params:
   *     image: '{= imageInstance =}'
   *   destination: imageInstance
   * ```
   */
  static async grayscale(params: GrayscaleParams): Promise<any> {
    const { image } = validations.image.grayscale.runtime.validate(params);
    image.grayscale();
    return image;
  }

  /**
   * Applies a Gaussian blur to an image with the given sigma radius.
   *
   * @param params - The input parameters.
   * @returns The blurred image instance.
   * @example
   * ```yaml
   * # Apply a light blur (sigma 3) — smooths out compression artefacts before OCR
   * - group: image
   *   name: blur
   *   params:
   *     image: '{= imageInstance =}'
   *     sigma: 3
   *   destination: imageInstance
   * ```
   */
  static async blur(params: BlurParams): Promise<any> {
    const { image, sigma } = validations.image.blur.runtime.validate(params);
    image.blur(sigma);
    return image;
  }

  /**
   * Sharpens an image to enhance edges and fine detail.
   *
   * @param params - The input parameters.
   * @returns The sharpened image instance.
   * @example
   * ```yaml
   * # Sharpen the image — improves readability of small text in scanned documents
   * - group: image
   *   name: sharpen
   *   params:
   *     image: '{= imageInstance =}'
   *   destination: imageInstance
   * ```
   */
  static async sharpen(params: SharpenParams): Promise<any> {
    const { image } = validations.image.sharpen.runtime.validate(params);
    image.sharpen();
    return image;
  }

  /**
   * Inverts the colors of an image (color negative effect).
   *
   * @param params - The input parameters.
   * @returns The negated image instance.
   * @example
   * ```yaml
   * # Invert colors — useful for creating a negative of a document scan
   * - group: image
   *   name: negate
   *   params:
   *     image: '{= imageInstance =}'
   *   destination: imageInstance
   * ```
   */
  static async negate(params: NegateParams): Promise<any> {
    const { image } = validations.image.negate.runtime.validate(params);
    image.negate();
    return image;
  }

  /**
   * Applies an RGB tint overlay to an image.
   *
   * @param params - The input parameters.
   * @returns The tinted image instance.
   * @example
   * ```yaml
   * # Apply a warm tint — shift colors toward a reddish tone
   * - group: image
   *   name: tint
   *   params:
   *     image: '{= imageInstance =}'
   *     r: 255
   *     g: 200
   *     b: 150
   *   destination: imageInstance
   * ```
   */
  static async tint(params: TintParams): Promise<any> {
    const { image, r, g, b } = validations.image.tint.runtime.validate(params);
    image.tint({ r, g, b });
    return image;
  }

  /**
   * Adjusts brightness, saturation, and hue of an image.
   *
   * @param params - The input parameters.
   * @returns The modulated image instance.
   * @example
   * ```yaml
   * # Boost brightness and desaturate slightly — normalizes photos for report covers
   * - group: image
   *   name: modulate
   *   params:
   *     image: '{= imageInstance =}'
   *     brightness: 1.2
   *     saturation: 0.9
   *     hue: 0
   *   destination: imageInstance
   * ```
   */
  static async modulate(params: ModulateParams): Promise<any> {
    const { image, brightness, saturation, hue } =
      validations.image.modulate.runtime.validate(params);
    image.modulate({ brightness, saturation, hue });
    return image;
  }

  // --------------------------------------------------
  // Composition
  // --------------------------------------------------

  /**
   * Composites (overlays) a second image on top of the base image at a given position.
   *
   * The overlay must be a file path to a supported image (PNG, JPEG, WebP, etc.).
   *
   * @param params - The input parameters.
   * @returns The composited image instance.
   * @example
   * ```yaml
   * # Stamp a watermark PNG in the top-left corner of the base image
   * - group: image
   *   name: composite
   *   params:
   *     image: '{= imageInstance =}'
   *     overlay: '{{ overlayPath }}'
   *     top: 10
   *     left: 10
   *   destination: imageInstance
   * ```
   */
  static async composite(params: CompositeParams): Promise<any> {
    const { image, overlay, top, left } = validations.image.composite.runtime.validate(params);
    image.composite([{ input: overlay, top, left }]);
    return image;
  }

  /**
   * Extends the canvas of an image by adding borders on each side with a background color.
   *
   * @param params - The input parameters.
   * @returns The extended image instance.
   * @example
   * ```yaml
   * # Add a 20px grey border around the image — useful for thumbnail frames
   * - group: image
   *   name: extend
   *   params:
   *     image: '{= imageInstance =}'
   *     top: 20
   *     bottom: 20
   *     left: 20
   *     right: 20
   *     background: '#cccccc'
   *   destination: imageInstance
   * ```
   */
  static async extend(params: ExtendParams): Promise<any> {
    const { image, top, bottom, left, right, background } =
      validations.image.extend.runtime.validate(params);
    image.extend({
      top,
      bottom,
      left,
      right,
      background,
    });
    return image;
  }

  // --------------------------------------------------
  // Metadata
  // --------------------------------------------------

  /**
   * Reads metadata from the current image state (format, width, height, channels, etc.).
   * `exif` comes from the original file (transforms drop it) and is decoded into plain
   * tags, e.g. `exif.DateTimeOriginal` as `2026-05-14 14:30:12` (camera clock, no timezone),
   * `exif.Make`, `exif.Model`, `exif.GPSInfo`. It is left out when the file has none.
   *
   * @param params - The input parameters.
   * @returns An object containing the image metadata.
   * @example
   * ```yaml
   * # Read metadata after transformations — inspect final format and dimensions
   * - group: image
   *   name: metadata
   *   params:
   *     image: '{= imageInstance =}'
   *   destination: imageMeta
   * ```
   */
  static async metadata(params: MetadataParams): Promise<any> {
    const { image } = validations.image.metadata.runtime.validate(params);
    const buffer = await image.toBuffer(); // applies all queued transforms before reading
    const result = await sharp(buffer).metadata();
    const original = await image.metadata(); // the input file, which still has its EXIF
    const exif = original.exif ? decodeExif(original.exif) : undefined;
    return { ...result, exif };
  }

  // --------------------------------------------------
  // Format & Output
  // --------------------------------------------------

  /**
   * Converts an image to the specified output format.
   *
   * @param params - The input parameters.
   * @returns The reformatted image instance.
   * @example
   * ```yaml
   * # Convert to WebP for optimized web delivery
   * - group: image
   *   name: toFormat
   *   params:
   *     image: '{= imageInstance =}'
   *     format: webp
   *   destination: imageInstance
   * ```
   */
  static async toFormat(params: ToFormatParams): Promise<any> {
    const { image, format } = validations.image.toFormat.runtime.validate(params);
    image.toFormat(format);
    return image;
  }

  /**
   * Renders all queued transforms and returns the image as a base64-encoded string.
   *
   * @param params - The input parameters.
   * @returns A base64-encoded string of the final image — useful for embedding or uploading.
   * @example
   * ```yaml
   * # Export to a base64 WebP string — useful for embedding in JSON payloads or emails
   * - group: image
   *   name: toBuffer
   *   params:
   *     image: '{= imageInstance =}'
   *     format: webp
   *   destination: imageBase64
   * ```
   */
  static async toBuffer(params: ToBufferParams): Promise<any> {
    const { image, format } = validations.image.toBuffer.runtime.validate(params);
    const buffer = format ? await image.toFormat(format).toBuffer() : await image.toBuffer();
    return buffer.toString('base64');
  }

  /**
   * Writes the final image to disk at the specified output path, creating directories as needed.
   *
   * @param params - The input parameters.
   * @returns `true` when the file has been written successfully.
   * @example
   * ```yaml
   * # Save the processed image to disk — output path is derived from a pipeline variable
   * - group: image
   *   name: toFile
   *   params:
   *     image: '{= imageInstance =}'
   *     output: '{{ outputPath }}'
   * ```
   */
  static async toFile(params: ToFileParams): Promise<any> {
    const { image, output } = validations.image.toFile.runtime.validate(params);
    const dir = path.dirname(output);
    fs.mkdirSync(dir, { recursive: true });
    await image.toFile(output);
    return true;
  }
}
