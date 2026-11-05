import { createWorker } from 'tesseract.js';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';

type RecognizeParams = z.infer<typeof validations.ocr.recognize.runtime.schema>;

/**
 * @group Actions
 */
export class GroupOCR {
  /**
   * Extracts text and confidence score from an image using Tesseract OCR.
   *
   * @param params - The input parameters.
   * @returns An object containing the extracted `text` and a `confidence` score from 0 to 100.
   * @example
   * ```yaml
   * # Extract text from a scanned invoice image
   * - group: ocr
   *   name: recognize
   *   params:
   *     source: '{{ imagePath }}'
   *     language: eng
   * ```
   */
  static async recognize(params: RecognizeParams): Promise<{ text: string; confidence: number }> {
    const parsed = validations.ocr.recognize.runtime.validate(params);

    const worker = await createWorker(parsed.language);

    try {
      const {
        data: { text, confidence },
      } = await worker.recognize(parsed.source);

      return {
        text: text,
        confidence: confidence,
      };
    } finally {
      await worker.terminate();
    }
  }
}
