import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';

type GenerateParams = z.infer<typeof validations.qrcode.generate.runtime.schema>;
type ReadParams = z.infer<typeof validations.qrcode.read.runtime.schema>;

/**
 * @group Actions
 */
export class GroupQRCode {
  // --------------------------------------------------
  // Generate
  // --------------------------------------------------

  /**
   * Generates a QR code image from a text string and saves it to disk.
   *
   * @param params - The input parameters.
   * @returns `true` when the file has been written successfully.
   * @example
   * ```yaml
   * # Generate a QR code from a URL and save it to the output directory
   * - group: qrcode
   *   name: generate
   *   params:
   *     text: 'https://tipeline.io/tasks/send-daily-report'
   *     path: '{{ outputPath }}'
   * ```
   */
  static async generate(params: GenerateParams): Promise<boolean> {
    const { text, path: outputPath } = validations.qrcode.generate.runtime.validate(params);

    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });

    await QRCode.toFile(outputPath, text);
    return true;
  }

  // --------------------------------------------------
  // Read
  // --------------------------------------------------

  /**
   * Decodes and returns the text encoded in a QR code image.
   *
   * @param params - The input parameters.
   * @returns The decoded string content of the QR code.
   * @throws If no QR code is found in the image.
   * @example
   * ```yaml
   * # Read the QR code from a scanned document and capture its decoded value
   * - group: qrcode
   *   name: read
   *   params:
   *     path: '{{ qrCodePath }}'
   * ```
   */
  static async read(params: ReadParams): Promise<string> {
    const { path: imagePath } = validations.qrcode.read.runtime.validate(params);

    const image = sharp(imagePath);
    const { data, info } = await image.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

    const code = jsQR(new Uint8ClampedArray(data), info.width, info.height);

    if (!code) {
      throw new Error('No QR code found in the image.');
    }

    return code.data;
  }
}
