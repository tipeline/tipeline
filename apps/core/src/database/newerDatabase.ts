/** This database was upgraded by a newer Core, whose migrations this one doesn't have. */
export class DatabaseNewerThanCoreError extends Error {
  constructor(migration: string, coreVersion: string) {
    super(
      `This database was upgraded by a newer version of Tipeline (migration ${migration}), and this Core is ${coreVersion}. Update Tipeline to open it.`
    );
    this.name = 'DatabaseNewerThanCoreError';
  }
}

/** The applied migration that's newer than everything this Core ships, if any. Names start with a timestamp. */
export function unknownNewerMigration(applied: string[], local: string[]): string | null {
  const newestLocal = [...local].sort().at(-1) ?? '';
  const newestApplied = [...applied].sort().at(-1) ?? '';
  return newestApplied > newestLocal ? newestApplied : null;
}
