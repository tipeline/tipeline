/** A ticked row in a bulk delete; `warning` flags it in the confirm list. */
export type BulkDeleteItem = { key: string; name: string; warning?: string };

export type BulkDeleteResult = {
  deleted: string[];
  failed: { name: string; error: string }[];
  /** Left alone on purpose (e.g. runs still running). */
  skipped?: number;
};

/**
 * Deletes the items one at a time; a failure is recorded and the rest still go.
 * `explain` turns an error into the text shown for it.
 */
export async function deleteEach(
  items: BulkDeleteItem[],
  remove: (key: string) => Promise<unknown>,
  explain: (message: string) => string
): Promise<BulkDeleteResult> {
  const result: BulkDeleteResult = { deleted: [], failed: [] };
  for (const item of items) {
    try {
      await remove(item.key);
      result.deleted.push(item.key);
    } catch (e: any) {
      result.failed.push({ name: item.name, error: explain(e?.message ?? String(e)) });
    }
  }
  return result;
}
