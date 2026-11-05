import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// --------------------------------------------------
// Mock `sharp` so no real image processing binaries/libvips calls happen.
// --------------------------------------------------
const { sharpFactory, createMockSharp } = vi.hoisted(() => {
  // The runtime validation for image params (imageSchema) checks
  // `val.constructor.name === 'Sharp'` plus the presence of a handful of
  // Sharp-like methods, so our mock class must literally be named `Sharp`.
  class Sharp {
    resize = vi.fn().mockReturnThis();
    rotate = vi.fn().mockReturnThis();
    flip = vi.fn().mockReturnThis();
    flop = vi.fn().mockReturnThis();
    extract = vi.fn().mockReturnThis();
    grayscale = vi.fn().mockReturnThis();
    blur = vi.fn().mockReturnThis();
    sharpen = vi.fn().mockReturnThis();
    negate = vi.fn().mockReturnThis();
    tint = vi.fn().mockReturnThis();
    modulate = vi.fn().mockReturnThis();
    composite = vi.fn().mockReturnThis();
    extend = vi.fn().mockReturnThis();
    toFormat = vi.fn().mockReturnThis();
    toBuffer = vi.fn().mockResolvedValue(Buffer.from('fake-image-bytes'));
    toFile = vi.fn().mockResolvedValue({ size: 42 });
    metadata = vi.fn().mockResolvedValue({ width: 800, height: 600, format: 'png' });
  }

  const createMockSharp = () => new Sharp();
  const sharpFactory = vi.fn(() => createMockSharp());

  return { sharpFactory, createMockSharp };
});

vi.mock('sharp', () => ({ default: sharpFactory }));

const { exifReader } = vi.hoisted(() => ({ exifReader: vi.fn() }));
vi.mock('exif-reader', () => ({ default: exifReader }));

import { GroupImage } from '@action/actions/image/actions';

describe('GroupImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('load', () => {
    it('calls sharp() with the given path and returns the instance', async () => {
      const result = await GroupImage.load({ path: '/inputs/photo.jpg' });
      expect(sharpFactory).toHaveBeenCalledWith('/inputs/photo.jpg');
      expect(result).toBeDefined();
      expect(typeof result.resize).toBe('function');
    });

    it('throws when path is missing', async () => {
      await expect(GroupImage.load({} as any)).rejects.toThrow();
    });

    it('throws when path is an empty string', async () => {
      await expect(GroupImage.load({ path: '' })).rejects.toThrow();
    });
  });

  describe('resize', () => {
    it('calls image.resize with width and height and returns the image', async () => {
      const image = createMockSharp();
      const result = await GroupImage.resize({ image: image as any, width: 800, height: 600 });
      expect(image.resize).toHaveBeenCalledWith(800, 600);
      expect(result).toBe(image);
    });

    it('allows resizing with only a width (height undefined)', async () => {
      const image = createMockSharp();
      const result = await GroupImage.resize({ image: image as any, width: 300 } as any);
      expect(image.resize).toHaveBeenCalledWith(300, undefined);
      expect(result).toBe(image);
    });

    it('throws when image is not a Sharp instance', async () => {
      await expect(
        GroupImage.resize({ image: {} as any, width: 100, height: 100 })
      ).rejects.toThrow();
    });

    it('throws when width is 0 (below the minimum of 1)', async () => {
      const image = createMockSharp();
      await expect(
        GroupImage.resize({ image: image as any, width: 0, height: 100 })
      ).rejects.toThrow();
    });
  });

  describe('rotate', () => {
    it('calls image.rotate with the given angle', async () => {
      const image = createMockSharp();
      const result = await GroupImage.rotate({ image: image as any, angle: 90 });
      expect(image.rotate).toHaveBeenCalledWith(90);
      expect(result).toBe(image);
    });

    it('throws when angle is missing', async () => {
      const image = createMockSharp();
      await expect(GroupImage.rotate({ image: image as any } as any)).rejects.toThrow();
    });
  });

  describe('flip', () => {
    it('calls image.flip with no arguments', async () => {
      const image = createMockSharp();
      const result = await GroupImage.flip({ image: image as any });
      expect(image.flip).toHaveBeenCalledWith();
      expect(result).toBe(image);
    });

    it('throws when image is missing', async () => {
      await expect(GroupImage.flip({} as any)).rejects.toThrow();
    });
  });

  describe('flop', () => {
    it('calls image.flop with no arguments', async () => {
      const image = createMockSharp();
      const result = await GroupImage.flop({ image: image as any });
      expect(image.flop).toHaveBeenCalledWith();
      expect(result).toBe(image);
    });

    it('throws when image is missing', async () => {
      await expect(GroupImage.flop({} as any)).rejects.toThrow();
    });
  });

  describe('crop', () => {
    it('calls image.extract with the crop rectangle', async () => {
      const image = createMockSharp();
      const result = await GroupImage.crop({
        image: image as any,
        left: 10,
        top: 20,
        width: 300,
        height: 400,
      });
      expect(image.extract).toHaveBeenCalledWith({ left: 10, top: 20, width: 300, height: 400 });
      expect(result).toBe(image);
    });

    it('throws when width is missing', async () => {
      const image = createMockSharp();
      await expect(
        GroupImage.crop({ image: image as any, left: 0, top: 0, height: 100 } as any)
      ).rejects.toThrow();
    });
  });

  describe('grayscale', () => {
    it('calls image.grayscale with no arguments', async () => {
      const image = createMockSharp();
      const result = await GroupImage.grayscale({ image: image as any });
      expect(image.grayscale).toHaveBeenCalledWith();
      expect(result).toBe(image);
    });

    it('throws when image is missing', async () => {
      await expect(GroupImage.grayscale({} as any)).rejects.toThrow();
    });
  });

  describe('blur', () => {
    it('calls image.blur with the given sigma', async () => {
      const image = createMockSharp();
      const result = await GroupImage.blur({ image: image as any, sigma: 5 });
      expect(image.blur).toHaveBeenCalledWith(5);
      expect(result).toBe(image);
    });

    it('throws when sigma is below the minimum of 0.3', async () => {
      const image = createMockSharp();
      await expect(GroupImage.blur({ image: image as any, sigma: 0.1 })).rejects.toThrow();
    });

    it('throws when sigma exceeds the maximum of 1000', async () => {
      const image = createMockSharp();
      await expect(GroupImage.blur({ image: image as any, sigma: 1001 })).rejects.toThrow();
    });
  });

  describe('sharpen', () => {
    it('calls image.sharpen with no arguments', async () => {
      const image = createMockSharp();
      const result = await GroupImage.sharpen({ image: image as any });
      expect(image.sharpen).toHaveBeenCalledWith();
      expect(result).toBe(image);
    });

    it('throws when image is missing', async () => {
      await expect(GroupImage.sharpen({} as any)).rejects.toThrow();
    });
  });

  describe('negate', () => {
    it('calls image.negate with no arguments', async () => {
      const image = createMockSharp();
      const result = await GroupImage.negate({ image: image as any });
      expect(image.negate).toHaveBeenCalledWith();
      expect(result).toBe(image);
    });

    it('throws when image is missing', async () => {
      await expect(GroupImage.negate({} as any)).rejects.toThrow();
    });
  });

  describe('tint', () => {
    it('calls image.tint with the given RGB values', async () => {
      const image = createMockSharp();
      const result = await GroupImage.tint({ image: image as any, r: 255, g: 200, b: 150 });
      expect(image.tint).toHaveBeenCalledWith({ r: 255, g: 200, b: 150 });
      expect(result).toBe(image);
    });

    it('throws when an RGB value is out of the 0-255 range', async () => {
      const image = createMockSharp();
      await expect(
        GroupImage.tint({ image: image as any, r: 300, g: 0, b: 0 })
      ).rejects.toThrow();
    });
  });

  describe('modulate', () => {
    it('calls image.modulate with brightness, saturation, and hue', async () => {
      const image = createMockSharp();
      const result = await GroupImage.modulate({
        image: image as any,
        brightness: 1.2,
        saturation: 0.9,
        hue: 0,
      });
      expect(image.modulate).toHaveBeenCalledWith({ brightness: 1.2, saturation: 0.9, hue: 0 });
      expect(result).toBe(image);
    });

    it('allows all modulation fields to be omitted (all optional)', async () => {
      const image = createMockSharp();
      const result = await GroupImage.modulate({ image: image as any } as any);
      expect(image.modulate).toHaveBeenCalledWith({
        brightness: undefined,
        saturation: undefined,
        hue: undefined,
      });
      expect(result).toBe(image);
    });
  });

  describe('composite', () => {
    it('calls image.composite with the overlay and position', async () => {
      const image = createMockSharp();
      const result = await GroupImage.composite({
        image: image as any,
        overlay: '/assets/watermark.png',
        top: 10,
        left: 10,
      });
      expect(image.composite).toHaveBeenCalledWith([
        { input: '/assets/watermark.png', top: 10, left: 10 },
      ]);
      expect(result).toBe(image);
    });

    it('defaults top/left to 0 when omitted', async () => {
      const image = createMockSharp();
      await GroupImage.composite({ image: image as any, overlay: '/assets/watermark.png' } as any);
      expect(image.composite).toHaveBeenCalledWith([
        { input: '/assets/watermark.png', top: 0, left: 0 },
      ]);
    });

    it('throws when overlay is missing', async () => {
      const image = createMockSharp();
      await expect(GroupImage.composite({ image: image as any } as any)).rejects.toThrow();
    });
  });

  describe('extend', () => {
    it('calls image.extend with border sizes and background color', async () => {
      const image = createMockSharp();
      const result = await GroupImage.extend({
        image: image as any,
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
        background: '#cccccc',
      });
      expect(image.extend).toHaveBeenCalledWith({
        top: 20,
        bottom: 20,
        left: 20,
        right: 20,
        background: '#cccccc',
      });
      expect(result).toBe(image);
    });

    it('defaults border sizes to 0 and background to #FFFFFF when omitted', async () => {
      const image = createMockSharp();
      await GroupImage.extend({ image: image as any } as any);
      expect(image.extend).toHaveBeenCalledWith({
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        background: '#FFFFFF',
      });
    });
  });

  describe('metadata', () => {
    it('flushes the pending transforms via toBuffer and reads metadata from a fresh Sharp instance', async () => {
      const image = createMockSharp();
      const result = await GroupImage.metadata({ image: image as any });

      expect(image.toBuffer).toHaveBeenCalled();
      // metadata() re-wraps the flushed buffer in a new sharp() instance
      expect(sharpFactory).toHaveBeenCalledWith(await image.toBuffer.mock.results[0].value);
      expect(result).toEqual({ width: 800, height: 600, format: 'png' });
    });

    it('decodes EXIF from the original file into flat, plain tags', async () => {
      const image = createMockSharp();
      const raw = Buffer.from('raw-exif');
      image.metadata.mockResolvedValueOnce({ width: 4000, exif: raw });
      exifReader.mockReturnValueOnce({
        bigEndian: false,
        Image: { Make: 'Canon', DateTime: new Date(Date.UTC(2026, 4, 15, 9, 0, 0)) },
        Photo: {
          DateTimeOriginal: new Date(Date.UTC(2026, 4, 14, 14, 30, 12)),
          MakerNote: Buffer.from('binary'),
          SubSecTimeOriginal: new Date(NaN),
        },
        GPSInfo: { GPSLatitude: [40, 26, 46] },
        Thumbnail: { Compression: 6 },
      });

      const result = await GroupImage.metadata({ image: image as any });

      expect(exifReader).toHaveBeenCalledWith(raw);
      expect(result).toEqual({
        width: 800,
        height: 600,
        format: 'png',
        exif: {
          Make: 'Canon',
          DateTime: '2026-05-15 09:00:00',
          DateTimeOriginal: '2026-05-14 14:30:12',
          GPSInfo: { GPSLatitude: [40, 26, 46] },
        },
      });
    });

    it('leaves exif out when the file has none or it cannot be decoded', async () => {
      const image = createMockSharp();
      expect((await GroupImage.metadata({ image: image as any })).exif).toBeUndefined();

      image.metadata.mockResolvedValueOnce({ exif: Buffer.from('junk') });
      exifReader.mockImplementationOnce(() => {
        throw new Error('Invalid EXIF');
      });
      expect((await GroupImage.metadata({ image: image as any })).exif).toBeUndefined();
    });

    it('throws when image is missing', async () => {
      await expect(GroupImage.metadata({} as any)).rejects.toThrow();
    });

    it('propagates a rejection from image.toBuffer', async () => {
      const image = createMockSharp();
      image.toBuffer.mockRejectedValueOnce(new Error('corrupt image data'));
      await expect(GroupImage.metadata({ image: image as any })).rejects.toThrow(
        'corrupt image data'
      );
    });
  });

  describe('toFormat', () => {
    it('calls image.toFormat with the given format', async () => {
      const image = createMockSharp();
      const result = await GroupImage.toFormat({ image: image as any, format: 'webp' });
      expect(image.toFormat).toHaveBeenCalledWith('webp');
      expect(result).toBe(image);
    });

    it('throws for an unsupported format', async () => {
      const image = createMockSharp();
      await expect(
        GroupImage.toFormat({ image: image as any, format: 'bmp' as any })
      ).rejects.toThrow();
    });
  });

  describe('toBuffer', () => {
    it('renders and returns a base64-encoded string when no format is given', async () => {
      const image = createMockSharp();
      const result = await GroupImage.toBuffer({ image: image as any });
      expect(image.toFormat).not.toHaveBeenCalled();
      expect(image.toBuffer).toHaveBeenCalled();
      expect(result).toBe(Buffer.from('fake-image-bytes').toString('base64'));
    });

    it('converts to the given format before rendering to a base64 string', async () => {
      const image = createMockSharp();
      const result = await GroupImage.toBuffer({ image: image as any, format: 'webp' });
      expect(image.toFormat).toHaveBeenCalledWith('webp');
      expect(image.toBuffer).toHaveBeenCalled();
      expect(result).toBe(Buffer.from('fake-image-bytes').toString('base64'));
    });

    it('propagates a rejection from image.toBuffer', async () => {
      const image = createMockSharp();
      image.toBuffer.mockRejectedValueOnce(new Error('encode failed'));
      await expect(GroupImage.toBuffer({ image: image as any })).rejects.toThrow('encode failed');
    });
  });

  describe('toFile', () => {
    const tmpOutDir = path.join(os.tmpdir(), 'tipeline-image-test');

    afterEach(() => {
      if (fs.existsSync(tmpOutDir)) {
        fs.rmSync(tmpOutDir, { recursive: true, force: true });
      }
    });

    it('creates the output directory and calls image.toFile, returning true', async () => {
      const image = createMockSharp();
      const output = path.join(tmpOutDir, 'nested', 'out.png');
      const result = await GroupImage.toFile({ image: image as any, output });

      expect(fs.existsSync(path.dirname(output))).toBe(true);
      expect(image.toFile).toHaveBeenCalledWith(output);
      expect(result).toBe(true);
    });

    it('throws when output path is missing', async () => {
      const image = createMockSharp();
      await expect(GroupImage.toFile({ image: image as any } as any)).rejects.toThrow();
    });

    it('propagates a rejection from image.toFile instead of resolving true', async () => {
      const image = createMockSharp();
      image.toFile.mockImplementationOnce(() => Promise.reject(new Error('disk full')));
      const output = path.join(tmpOutDir, 'unchecked.png');

      await expect(GroupImage.toFile({ image: image as any, output })).rejects.toThrow(
        'disk full'
      );
    });
  });
});
