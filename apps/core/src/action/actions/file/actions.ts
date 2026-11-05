import fs from 'fs-extra';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import path from 'path';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';

type FileExistsParams = z.infer<typeof validations.file.fileExists.runtime.schema>;
type CopyParams = z.infer<typeof validations.file.copy.runtime.schema>;
type MoveParams = z.infer<typeof validations.file.move.runtime.schema>;
type RemoveParams = z.infer<typeof validations.file.remove.runtime.schema>;
type RenameParams = z.infer<typeof validations.file.rename.runtime.schema>;
type ReadParams = z.infer<typeof validations.file.read.runtime.schema>;
type WriteParams = z.infer<typeof validations.file.write.runtime.schema>;
type ReadCSVParams = z.infer<typeof validations.file.readCSV.runtime.schema>;
type WriteCSVParams = z.infer<typeof validations.file.writeCSV.runtime.schema>;
type GetFilePathPartParams = z.infer<typeof validations.file.getFilePathPart.runtime.schema>;
type ConvertFileToBase64Params = z.infer<typeof validations.file.convertFileToBase64.runtime.schema>;
type ConvertBase64ToFileParams = z.infer<typeof validations.file.convertBase64ToFile.runtime.schema>;

/**
 * @group Actions
 */
export class GroupFile {
  // --------------------------------------------------
  // Existence
  // --------------------------------------------------

  /**
   * Checks whether a file or directory exists at the given path.
   *
   * @param params - The input parameters.
   * @returns `true` if the path exists, otherwise throws.
   * @example
   * ```yaml
   * # Verify the daily report exists before downstream actions attempt to read it
   * - group: file
   *   name: fileExists
   *   params:
   *     src: '{{ reportFile }}'
   * ```
   */
  static async fileExists(params: FileExistsParams): Promise<boolean> {
    const parsed = validations.file.fileExists.runtime.validate(params);
    await fs.access(parsed.src, fs.constants.F_OK);
    return true;
  }

  // --------------------------------------------------
  // Copy & Move
  // --------------------------------------------------

  /**
   * Copies a file or directory to a new location.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Back up the report before processing — preserves the original in case of failure
   * - group: file
   *   name: copy
   *   params:
   *     src: '{{ reportFile }}'
   *     dest: '{{ backupFile }}'
   * ```
   */
  static async copy(params: CopyParams): Promise<boolean> {
    const parsed = validations.file.copy.runtime.validate(params);
    await fs.copy(parsed.src, parsed.dest);
    return true;
  }

  /**
   * Moves a file or directory to a new location.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Move the backup to the archive directory after processing is complete
   * - group: file
   *   name: move
   *   params:
   *     src: '{{ backupFile }}'
   *     dest: '{{ archivedFile }}'
   * ```
   */
  static async move(params: MoveParams): Promise<boolean> {
    const parsed = validations.file.move.runtime.validate(params);
    await fs.move(parsed.src, parsed.dest);
    return true;
  }

  /**
   * Renames a file or directory.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Rename the archived file to include the pipeline name for traceability
   * - group: file
   *   name: rename
   *   params:
   *     oldPath: '{{ archivedFile }}'
   *     newPath: '{{ renamedFile }}'
   * ```
   */
  static async rename(params: RenameParams): Promise<boolean> {
    const parsed = validations.file.rename.runtime.validate(params);
    await fs.rename(parsed.oldPath, parsed.newPath);
    return true;
  }

  /**
   * Deletes a file or directory.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Clean up the renamed archive after processing — keeps the working directory tidy
   * - group: file
   *   name: remove
   *   params:
   *     src: '{{ renamedFile }}'
   * ```
   */
  static async remove(params: RemoveParams): Promise<boolean> {
    const parsed = validations.file.remove.runtime.validate(params);
    await fs.remove(parsed.src);
    return true;
  }

  // --------------------------------------------------
  // Read & Write
  // --------------------------------------------------

  /**
   * Reads the content of a file as a UTF-8 string.
   *
   * @param params - The input parameters.
   * @returns The file content as a string.
   * @example
   * ```yaml
   * # Read the daily report content to pass downstream to an email or notification action
   * - group: file
   *   name: read
   *   params:
   *     src: '{{ reportFile }}'
   * ```
   */
  static async read(params: ReadParams): Promise<string> {
    const parsed = validations.file.read.runtime.validate(params);
    return fs.readFile(parsed.src, { encoding: 'utf8' });
  }

  /**
   * Writes text to a file, creating parent directories if needed.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Write a pipeline summary to a log file after execution completes
   * - group: file
   *   name: write
   *   params:
   *     src: '/tmp/tipeline/logs/pipeline-summary.txt'
   *     data: 'Pipeline completed successfully. Report: daily-report.txt'
   * ```
   */
  static async write(params: WriteParams): Promise<boolean> {
    const parsed = validations.file.write.runtime.validate(params);
    await fs.outputFile(parsed.src, parsed.data);
    return true;
  }

  // --------------------------------------------------
  // CSV
  // --------------------------------------------------

  /**
   * Parses a CSV file into an array of row objects.
   *
   * @param params - The input parameters.
   * @returns An array of parsed row objects.
   * @example
   * ```yaml
   * # Parse an invoice CSV into rows for downstream processing or filtering
   * - group: file
   *   name: readCSV
   *   params:
   *     src: '{{ csvInput }}'
   *     options:
   *       columns: true
   *       skip_empty_lines: true
   *       delimiter: ','
   *       trim: true
   * ```
   */
  static async readCSV(params: ReadCSVParams): Promise<any[]> {
    const parsed = validations.file.readCSV.runtime.validate(params);
    const content = await fs.readFile(parsed.src, 'utf8');
    return parse(content, parsed.options);
  }

  /**
   * Writes an array of row objects to a CSV file, creating parent directories if needed.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Write processed invoice rows back to a CSV for export or archiving
   * - group: file
   *   name: writeCSV
   *   params:
   *     src: '{{ csvOutput }}'
   *     rows:
   *       - invoice: 'INV-001'
   *         client: 'Acme Corp'
   *         amount: 4200
   *       - invoice: 'INV-002'
   *         client: 'Globex'
   *         amount: 8750
   * ```
   */
  static async writeCSV(params: WriteCSVParams): Promise<boolean> {
    const parsed = validations.file.writeCSV.runtime.validate(params);
    const csv = stringify(parsed.rows, { header: true });
    await fs.outputFile(parsed.src, csv);
    return true;
  }

  // --------------------------------------------------
  // Path
  // --------------------------------------------------

  /**
   * Extracts a specific portion of a file path (dirname, basename, extname, filename, or root).
   *
   * @param params - The input parameters.
   * @returns The requested path segment as a string.
   * @example
   * ```yaml
   * # Extract the directory from a report path — useful for creating sibling files
   * - group: file
   *   name: getFilePathPart
   *   params:
   *     src: '{{ reportFile }}'
   *     part: dirname
   * ```
   */
  static async getFilePathPart(params: GetFilePathPartParams): Promise<string> {
    const { src, part } = validations.file.getFilePathPart.runtime.validate(params);
    switch (part) {
      case 'dirname':
        return path.dirname(src);
      case 'basename':
        return path.basename(src);
      case 'extname':
        return path.extname(src);
      case 'filename':
        return path.basename(src, path.extname(src));
      case 'root':
        return path.parse(src).root;
      default:
        throw new Error(`Unknown part "${part}"`);
    }
  }

  // --------------------------------------------------
  // Base64
  // --------------------------------------------------

  /**
   * Reads a file and returns its content encoded as a Base64 string.
   *
   * @param params - The input parameters.
   * @returns The Base64-encoded file content.
   * @example
   * ```yaml
   * # Encode the report file to Base64 — useful when attaching it to an HTTP or email payload
   * - group: file
   *   name: convertFileToBase64
   *   params:
   *     src: '{{ reportFile }}'
   *   destination: base64Data
   * ```
   */
  static async convertFileToBase64(params: ConvertFileToBase64Params): Promise<string> {
    const parsed = validations.file.convertFileToBase64.runtime.validate(params);
    const buffer = await fs.readFile(parsed.src);
    return buffer.toString('base64');
  }

  /**
   * Decodes a Base64 string and writes the result to a file, creating parent directories if needed.
   *
   * @param params - The input parameters.
   * @returns `true` on success.
   * @example
   * ```yaml
   * # Decode a Base64 attachment and write it to disk for further processing
   * - group: file
   *   name: convertBase64ToFile
   *   params:
   *     dest: '/tmp/tipeline/reports/decoded-report.txt'
   *     base64: '{{ base64Data }}'
   * ```
   */
  static async convertBase64ToFile(params: ConvertBase64ToFileParams): Promise<boolean> {
    const parsed = validations.file.convertBase64ToFile.runtime.validate(params);
    const buffer = Buffer.from(parsed.base64, 'base64');
    await fs.outputFile(parsed.dest, buffer);
    return true;
  }
}
