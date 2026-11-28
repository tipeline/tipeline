import fs from 'node:fs';
import path from 'node:path';
import { generateIdentifier } from '@tipeline/utils';
import { expandHomePath } from '@utils/expandHome';
import { Hub } from '@database/models/Hub';
import { TaskHubLink } from '@database/models/TaskHubLink';
import { AppHubLink } from '@database/models/AppHubLink';
import { PluginHubLink } from '@database/models/PluginHubLink';

/** A local folder may be typed as "~/…"; it is saved as the full path so every reader sees the same folder. */
function normalizeHubTarget(type: string, target: string): string {
  const trimmed = (target ?? '').trim();
  return type === 'local_folder' ? expandHomePath(trimmed) : trimmed;
}

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

/** A token is only sent to a remote hub's own host: on a folder it would do nothing. */
function assertTokenFits(type: string, token: string | null | undefined) {
  if (type === 'local_folder' && token?.trim()) {
    throw new Error('A local_folder hub is read from disk, so it takes no token. Tokens are for remote hubs.');
  }
}

/**
 * The official hub. Every Core has it from the first start, under this fixed id, so items
 * installed from it keep the same hub link on every machine. Like the Local workspace it
 * can't be edited or removed — its address ships with Tipeline — but it can be switched off.
 */
export const OFFICIAL_HUB = {
  id: 'tipeline-hub',
  name: 'Tipeline Hub',
  type: 'remote' as const,
  target: 'https://hub.tipeline.com',
};

export function isBuiltInHub(id: string): boolean {
  return id === OFFICIAL_HUB.id;
}

function assertEditableHub(id: string, action: string) {
  if (isBuiltInHub(id)) throw new Error(`${OFFICIAL_HUB.name} is built in and can't be ${action}. You can switch it off.`);
}

export class HubService {
  /**
   * Adds the official hub on first start. Later starts keep the user's on/off choice and
   * bring its name and address in line with this release, so a moved hub follows along.
   */
  static async ensureOfficialHub(): Promise<void> {
    const { id, name, type, target } = OFFICIAL_HUB;
    const current = await Hub.query().findById(id);
    if (!current) {
      await Hub.query().insert({ id, name, type, target, token: null, enabled: true });
    } else if (current.name !== name || current.type !== type || current.target !== target || current.token) {
      await Hub.query().patch({ name, type, target, token: null }).where({ id });
    }
  }


  /** The official hub first, then the user's own in the order they were added. */
  static async list(): Promise<Hub[]> {
    return Hub.query().orderByRaw('id = ? desc', [OFFICIAL_HUB.id]).orderBy('created_at');
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
    const target = normalizeHubTarget(data.type, data.target);
    assertValidHubTarget(data.type, target);
    assertTokenFits(data.type, data.token);
    return Hub.query().insertAndFetch({
      id: generateIdentifier(),
      name: data.name,
      type: data.type,
      target,
      token: data.token?.trim() || null,
      enabled: true,
    });
  }

  /** A `token` left out keeps the saved one; `null` or `''` removes it. */
  static async update(
    id: string,
    data: Partial<{ name: string; type: 'remote' | 'local_folder'; target: string; token: string | null }>
  ): Promise<Hub> {
    assertEditableHub(id, 'edited');
    const patch = { ...data };
    if (data.type !== undefined || data.target !== undefined || data.token) {
      const current = await Hub.query().findById(id);
      if (!current) throw new Error(`Hub "${id}" not found`);
      const type = data.type ?? current.type;
      const target = normalizeHubTarget(type, data.target ?? current.target);
      assertValidHubTarget(type, target);
      assertTokenFits(type, data.token);
      if (data.target !== undefined) patch.target = target;
      // A hub turned into a folder has nothing to send its old token to.
      if (type === 'local_folder' && !('token' in patch)) patch.token = null;
    }
    if ('token' in patch) patch.token = patch.token?.trim() || null;
    const record = await Hub.query().patchAndFetchById(id, patch);
    if (!record) throw new Error(`Hub "${id}" not found`);
    return record;
  }

  static async remove(id: string): Promise<void> {
    assertEditableHub(id, 'removed');
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
