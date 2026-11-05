import fs from 'node:fs';
import path from 'node:path';
import { generateIdentifier } from '@tipeline/utils';
import { Hub } from '@database/models/Hub';
import { TaskHubLink } from '@database/models/TaskHubLink';
import { AppHubLink } from '@database/models/AppHubLink';
import { PluginHubLink } from '@database/models/PluginHubLink';

/** A wrong hub otherwise only shows up later, as an hourly line in a log. */
function assertValidHubTarget(type: string, target: string) {
  if (type === 'local_folder') {
    if (!path.isAbsolute(target ?? '')) throw new Error(`A local_folder hub needs an absolute folder path, not "${target}".`);
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error(`Folder not found: ${target}`);
  } else if (type === 'remote') {
    let protocol = '';
    try {
      protocol = new URL(target).protocol;
    } catch {
      // reported below
    }
    if (protocol !== 'http:' && protocol !== 'https:') {
      throw new Error(`A remote hub needs an http:// or https:// address, not "${target}".`);
    }
  } else {
    throw new Error(`Unknown hub type "${type}". Use remote or local_folder.`);
  }
}

export class HubService {
  static async list(): Promise<Hub[]> {
    return Hub.query().orderBy('created_at');
  }

  static async listEnabled(): Promise<Hub[]> {
    return Hub.query().where({ enabled: true }).orderBy('created_at');
  }

  static async getById(id: string): Promise<Hub | null> {
    return (await Hub.query().findById(id)) ?? null;
  }

  static async add(data: {
    name: string;
    type: 'remote' | 'local_folder';
    target: string;
    token?: string | null;
  }): Promise<Hub> {
    assertValidHubTarget(data.type, data.target);
    return Hub.query().insertAndFetch({
      id: generateIdentifier(),
      name: data.name,
      type: data.type,
      target: data.target,
      token: data.token?.trim() || null,
      enabled: true,
    });
  }

  /** A `token` left out keeps the saved one; `null` or `''` removes it. */
  static async update(
    id: string,
    data: Partial<{ name: string; type: 'remote' | 'local_folder'; target: string; token: string | null }>
  ): Promise<Hub> {
    if (data.type !== undefined || data.target !== undefined) {
      const current = await Hub.query().findById(id);
      if (!current) throw new Error(`Hub "${id}" not found`);
      assertValidHubTarget(data.type ?? current.type, data.target ?? current.target);
    }
    const patch = { ...data };
    if ('token' in patch) patch.token = patch.token?.trim() || null;
    const record = await Hub.query().patchAndFetchById(id, patch);
    if (!record) throw new Error(`Hub "${id}" not found`);
    return record;
  }

  static async remove(id: string): Promise<void> {
    await Hub.transaction(async (trx) => {
      // Application-level cascade: the link tables declare ON DELETE CASCADE
      // on hub_id, but SQLite only enforces/cascades FKs when
      // `PRAGMA foreign_keys = ON`, which this codebase deliberately never
      // sets (see 20260928000002_normalize_hub_links.js's comment — turning
      // that pragma on previously cascade-deleted pipeline/schedule rows
      // during an unrelated migration). Delete the link rows explicitly
      // instead of relying on the DB-level cascade.
      await TaskHubLink.query(trx).delete().where({ hub_id: id });
      await AppHubLink.query(trx).delete().where({ hub_id: id });
      await PluginHubLink.query(trx).delete().where({ hub_id: id });

      const count = await Hub.query(trx).deleteById(id);
      if (!count) throw new Error(`Hub "${id}" not found`);
    });
  }

  static async setEnabled(id: string, enabled: boolean): Promise<Hub> {
    const record = await Hub.query().patchAndFetchById(id, { enabled });
    if (!record) throw new Error(`Hub "${id}" not found`);
    return record;
  }

  static async markChecked(id: string): Promise<void> {
    await Hub.query().patch({ last_checked_at: new Date().toISOString() } as any).where({ id });
  }
}
