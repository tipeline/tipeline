import fs from 'fs-extra';
import path from 'path';
import { z } from 'zod';
import { validations } from '@tipeline/schemas';

type ExistsParams = z.infer<typeof validations.folder.exists.runtime.schema>;
type GetFilesParams = z.infer<typeof validations.folder.getFiles.runtime.schema>;
type GetSubfoldersParams = z.infer<typeof validations.folder.getSubfolders.runtime.schema>;
type CreateParams = z.infer<typeof validations.folder.create.runtime.schema>;
type DeleteParams = z.infer<typeof validations.folder.delete.runtime.schema>;
type EmptyParams = z.infer<typeof validations.folder.empty.runtime.schema>;
type CopyParams = z.infer<typeof validations.folder.copy.runtime.schema>;
type MoveParams = z.infer<typeof validations.folder.move.runtime.schema>;
type RenameParams = z.infer<typeof validations.folder.rename.runtime.schema>;

/**
 * @group Actions
 */
export class GroupFolder {
  // --------------------------------------------------
  // Inspect
  // --------------------------------------------------

  /**
   * Checks whether a folder exists at the given path.
   *
   * @param params - The input parameters.
   * @returns `true` if a directory exists at the path, otherwise `false`.
   * @example
   * ```yaml
   * # Verify a target folder exists before writing files into it
   * - group: folder
   *   name: exists
   *   params:
   *     src: '{{ folderSrc }}'
   * ```
   */
  static async exists(params: ExistsParams): Promise<boolean> {
    const parsed = validations.folder.exists.runtime.validate(params);
    const stat = await fs.stat(parsed.src);
    return stat.isDirectory();
  }

  /**
   * Lists the entries in a folder (non-recursive). By default it returns bare names
   * (`photo.jpg`, not `/path/photo.jpg`) and includes subfolders.
   *
   * @param params - The input parameters.
   * @returns An array of entry names, or full paths when `fullPaths` is true.
   * @example
   * ```yaml
   * # List the photos in a folder as full paths, ready for image.load
   * - group: folder
   *   name: getFiles
   *   params:
   *     src: '{{ folderSrc }}'
   *     fullPaths: true
   *     extensions: [jpg, jpeg, png, heic]
   * ```
   */
  static async getFiles(params: GetFilesParams): Promise<string[]> {
    const parsed = validations.folder.getFiles.runtime.validate(params);
    let names: string[];
    if (parsed.extensions?.length) {
      const wanted = parsed.extensions.map((ext) => ext.replace(/^\./, '').toLowerCase());
      const entries = await fs.readdir(parsed.src, { withFileTypes: true });
      names = entries
        .filter((e) => e.isFile() && wanted.includes(path.extname(e.name).slice(1).toLowerCase()))
        .map((e) => e.name);
    } else {
      names = await fs.readdir(parsed.src);
    }
    return parsed.fullPaths ? names.map((name) => path.join(parsed.src, name)) : names;
  }

  /**
   * Lists only the subdirectory names within a folder (non-recursive).
   *
   * @param params - The input parameters.
   * @returns An array of subdirectory names.
   * @example
   * ```yaml
   * # Get all category subfolders inside the archive root
   * - group: folder
   *   name: getSubfolders
   *   params:
   *     src: '{{ folderSrc }}'
   * ```
   */
  static async getSubfolders(params: GetSubfoldersParams): Promise<string[]> {
    const parsed = validations.folder.getSubfolders.runtime.validate(params);
    const entries = await fs.readdir(parsed.src, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  // --------------------------------------------------
  // Create & Delete
  // --------------------------------------------------

  /**
   * Creates a folder at the given path, including any missing parent directories.
   *
   * @param params - The input parameters.
   * @returns The path of the first directory created, or `undefined` if it already existed.
   * @example
   * ```yaml
   * # Create the output folder for a pipeline run (recursive)
   * - group: folder
   *   name: create
   *   params:
   *     src: '{{ folderNew }}'
   * ```
   */
  static async create(params: CreateParams): Promise<string | undefined> {
    const parsed = validations.folder.create.runtime.validate(params);
    return await fs.mkdir(parsed.src, { recursive: true });
  }

  /**
   * Deletes a folder and all its contents.
   *
   * @param params - The input parameters.
   * @returns `true` when the folder has been removed.
   * @example
   * ```yaml
   * # Remove the temporary working folder after a pipeline run completes
   * - group: folder
   *   name: delete
   *   params:
   *     src: '{{ folderNew }}'
   * ```
   */
  static async delete(params: DeleteParams): Promise<boolean> {
    const parsed = validations.folder.delete.runtime.validate(params);
    await fs.remove(parsed.src);
    return true;
  }

  /**
   * Removes all contents of a folder without deleting the folder itself.
   *
   * @param params - The input parameters.
   * @returns `true` when the folder has been emptied.
   * @example
   * ```yaml
   * # Clear the staging folder before writing a fresh batch of exports
   * - group: folder
   *   name: empty
   *   params:
   *     src: '{{ folderNew }}'
   * ```
   */
  static async empty(params: EmptyParams): Promise<boolean> {
    const parsed = validations.folder.empty.runtime.validate(params);
    await fs.emptyDir(parsed.src);
    return true;
  }

  // --------------------------------------------------
  // Copy, Move & Rename
  // --------------------------------------------------

  /**
   * Copies a folder and all its contents to a new destination.
   *
   * @param params - The input parameters.
   * @returns `true` when the copy is complete.
   * @example
   * ```yaml
   * # Back up the current output folder before overwriting it
   * - group: folder
   *   name: copy
   *   params:
   *     src: '{{ folderNew }}'
   *     dest: '{{ folderCopy }}'
   * ```
   */
  static async copy(params: CopyParams): Promise<boolean> {
    const parsed = validations.folder.copy.runtime.validate(params);
    await fs.copy(parsed.src, parsed.dest);
    return true;
  }

  /**
   * Moves a folder to a new destination path.
   *
   * @param params - The input parameters.
   * @returns `true` when the move is complete.
   * @example
   * ```yaml
   * # Move the processed folder into the archive directory
   * - group: folder
   *   name: move
   *   params:
   *     src: '{{ folderCopy }}'
   *     dest: '{{ folderRenamed }}'
   * ```
   */
  static async move(params: MoveParams): Promise<boolean> {
    const parsed = validations.folder.move.runtime.validate(params);
    await fs.move(parsed.src, parsed.dest);
    return true;
  }

  /**
   * Renames a folder by providing the old and new path.
   *
   * @param params - The input parameters.
   * @returns `true` when the rename is complete.
   * @example
   * ```yaml
   * # Rename the staging folder to reflect the completed pipeline run ID
   * - group: folder
   *   name: rename
   *   params:
   *     oldPath: '{{ folderNew }}'
   *     newPath: '{{ folderCopy }}'
   * ```
   */
  static async rename(params: RenameParams): Promise<boolean> {
    const parsed = validations.folder.rename.runtime.validate(params);
    await fs.rename(parsed.oldPath, parsed.newPath);
    return true;
  }
}
