import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import decompress from 'decompress';
import zlib from 'zlib';
import * as tar from 'tar';
import { z } from 'zod';

import { validations } from '@tipeline/schemas';

type ArchiveParams = z.infer<typeof validations.compression.archive.runtime.schema>;
type UnarchiveParams = z.infer<typeof validations.compression.unarchive.runtime.schema>;

/**
 * @group Actions
 */
export class GroupCompression {
  /**
   * Creates an archive from one or more files, directories, or glob patterns.
   *
   * Supports `zip`, `tar`, and `tar.gz` formats. Sources that don't exist at
   * runtime cause the promise to reject immediately.
   *
   * @param params - The input parameters.
   * @returns `true` when the archive is written and closed successfully.
   * @example
   * ```yaml
   * # Archive a folder and all YAML files in the actions directory as a tar.gz
   * - group: compression
   *   name: archive
   *   params:
   *     path: /path/to/output/archive.tar.gz
   *     sources:
   *       - /path/to/folder
   *       - /path/to/actions/*.yml
   *     level: 7
   *     format: tar.gz
   * ```
   */
  static async archive(params: ArchiveParams): Promise<boolean> {
    const parsed = validations.compression.archive.runtime.validate(params);

    return new Promise((resolve, reject) => {
      const { format, level, path: outputPath, sources } = parsed;

      const baseStream = fs.createWriteStream(outputPath);
      const archive = archiver(format === 'tar.gz' ? 'tar' : format, {
        zlib: { level: level ?? 9 },
      });

      if (format === 'tar.gz') {
        archive.pipe(zlib.createGzip({ level: level ?? 9 })).pipe(baseStream);
      } else {
        archive.pipe(baseStream);
      }

      baseStream.on('close', () => resolve(true));
      baseStream.on('error', (err) => reject(err));
      archive.on('warning', (err) => reject(err));
      archive.on('error', (err) => reject(err));

      for (const source of sources) {
        const isGlob = /[*?\[\]]/.test(source);

        if (!isGlob && !fs.existsSync(source)) {
          return reject(new Error(`Source not found: ${source}`));
        }

        if (!isGlob) {
          const stat = fs.statSync(source);
          if (stat.isFile()) {
            archive.file(source, { name: path.basename(source) });
          } else if (stat.isDirectory()) {
            archive.directory(source, path.basename(source));
          } else {
            return reject(new Error(`Unsupported source type: ${source}`));
          }
        } else {
          const dirname = path.dirname(source);
          const pattern = path.basename(source);
          archive.glob(pattern, { cwd: dirname });
        }
      }

      archive.finalize();
    });
  }

  /**
   * Extracts an archive to a destination directory.
   *
   * Supports `.zip`, `.tar`, and `.tar.gz` formats. The destination directory
   * is created automatically if it does not exist.
   *
   * @param params - The input parameters.
   * @returns `true` when extraction completes successfully.
   * @example
   * ```yaml
   * # Extract a tar.gz archive into a dedicated output folder
   * - group: compression
   *   name: unarchive
   *   params:
   *     path: /path/to/archive.tar.gz
   *     destination: /path/to/output/
   * ```
   */
  static async unarchive(params: UnarchiveParams): Promise<boolean> {
    const parsed = validations.compression.unarchive.runtime.validate(params);
    const archivePath = parsed.path;
    const destination = parsed.destination;

    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const ext = path.extname(archivePath).toLowerCase();
    const isTarGz = archivePath.endsWith('.tar.gz');

    if (isTarGz || ext === '.tar') {
      await tar.extract({
        file: archivePath,
        cwd: destination,
        strict: true,
      });
    } else if (ext === '.zip') {
      await decompress(archivePath, destination);
    } else {
      throw new Error(`Unsupported archive format: ${archivePath}`);
    }

    return true;
  }
}
