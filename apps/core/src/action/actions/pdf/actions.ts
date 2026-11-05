import { extractText, getDocumentProxy, definePDFJSModule, extractImages } from 'unpdf';
import fs from 'fs-extra';
import sharp from 'sharp';
import path from 'path';
import PDFMerger from 'pdf-merger-js';
import { z } from 'zod';

import { validations } from '@tipeline/schemas';

definePDFJSModule(() => import('pdfjs-dist/legacy/build/pdf.mjs'));

type ExtractTextParams = z.infer<typeof validations.pdf.extractText.runtime.schema>;
type ExtractImageParams = z.infer<typeof validations.pdf.extractImage.runtime.schema>;
type MergeParams = z.infer<typeof validations.pdf.merge.runtime.schema>;
type GetPageCountParams = z.infer<typeof validations.pdf.getPageCount.runtime.schema>;
type SplitPagesParams = z.infer<typeof validations.pdf.splitPages.runtime.schema>;

/**
 * @group Actions
 */
export class GroupPDF {
  /**
   * Extracts all text content from a PDF file, merging all pages into a single string.
   *
   * @param params - The input parameters.
   * @returns The full text extracted from the PDF as a single string.
   * @example
   * ```yaml
   * # Extract text from a scanned invoice PDF
   * - group: pdf
   *   name: extractText
   *   params:
   *     path: '{{ pdfPath }}'
   * ```
   */
  static async extractText(params: ExtractTextParams): Promise<string> {
    const parsed = validations.pdf.extractText.runtime.validate(params);
    const buffer = await fs.readFile(parsed.path);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }

  /**
   * Extracts all images from the first page of a PDF and saves them as PNG files.
   *
   * @param params - The input parameters.
   * @returns An array of file paths to the saved PNG images.
   * @example
   * ```yaml
   * # Extract images from a PDF page and save them to a folder
   * - group: pdf
   *   name: extractImage
   *   params:
   *     path: '{{ pdfPath }}'
   *     output: '{{ outputFolder }}'
   * ```
   */
  static async extractImage(params: ExtractImageParams): Promise<string[]> {
    const parsed = validations.pdf.extractImage.runtime.validate(params);
    const buffer = await fs.readFile(parsed.path);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));

    const imagesData = await extractImages(pdf, 1);

    const outputFolder = parsed.output;
    await fs.ensureDir(outputFolder);

    const outputPaths: string[] = [];

    for (let i = 0; i < imagesData.length; i++) {
      const imgData = imagesData[i];
      const outputPath = path.join(outputFolder, `image-${i + 1}.png`);
      await sharp(imgData.data, {
        raw: {
          width: imgData.width,
          height: imgData.height,
          channels: imgData.channels,
        },
      })
        .png()
        .toFile(outputPath);
      outputPaths.push(outputPath);
    }

    return outputPaths;
  }

  /**
   * Merges multiple PDF files into a single output PDF.
   *
   * @param params - The input parameters.
   * @returns The file path to the merged PDF.
   * @example
   * ```yaml
   * # Merge a list of report PDFs into one consolidated file
   * - group: pdf
   *   name: merge
   *   params:
   *     input: '{= pdfFiles =}'
   *     output: '{{ mergedOutput }}'
   * ```
   */
  static async merge(params: MergeParams): Promise<string> {
    const parsed = validations.pdf.merge.runtime.validate(params);

    const merger = new PDFMerger();

    for (const file of parsed.input) {
      await merger.add(file);
    }

    await fs.ensureDir(path.dirname(parsed.output));
    await merger.save(parsed.output);

    return parsed.output;
  }

  /**
   * Returns the total number of pages in a PDF file.
   *
   * @param params - The input parameters.
   * @returns The page count as a number.
   * @example
   * ```yaml
   * # Get page count — useful for conditional branching on multi-page documents
   * - group: pdf
   *   name: getPageCount
   *   params:
   *     path: '{{ pdfPath }}'
   * ```
   */
  static async getPageCount(params: GetPageCountParams): Promise<number> {
    const parsed = validations.pdf.getPageCount.runtime.validate(params);
    const buffer = await fs.readFile(parsed.path);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    return pdf.numPages;
  }

  /**
   * Splits a PDF into one file per page, saving each to an output directory.
   *
   * @param params - The input parameters.
   * @returns An array of file paths for each extracted page PDF.
   * @example
   * ```yaml
   * # Split an invoice bundle into individual page files
   * - group: pdf
   *   name: splitPages
   *   params:
   *     path: '{{ pdfPath }}'
   *     output: '{{ splitOutput }}'
   *     prefix: invoice
   * ```
   */
  static async splitPages(params: SplitPagesParams): Promise<string[]> {
    const parsed = validations.pdf.splitPages.runtime.validate(params);
    const buffer = await fs.readFile(parsed.path);
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const totalPages = pdf.numPages;

    await fs.ensureDir(parsed.output);

    const prefix = parsed.prefix ?? 'page';
    const outputPaths: string[] = [];

    for (let i = 1; i <= totalPages; i++) {
      const merger = new PDFMerger();
      await merger.add(parsed.path, [String(i)]);
      const outputPath = path.join(parsed.output, `${prefix}-${i}.pdf`);
      await merger.save(outputPath);
      outputPaths.push(outputPath);
    }

    return outputPaths;
  }
}
