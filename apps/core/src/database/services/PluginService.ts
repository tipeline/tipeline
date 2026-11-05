import { hubUpdateState } from '@/hub/HubUpdatePolicy';
import { Plugin as PluginModel } from '@/database/models/Plugin';
import { PluginHubLink } from '@/database/models/PluginHubLink';
import { generateIdentifier } from '@tipeline/utils';

// Every query that lists/details a plugin computes this instead of reading a
// stored column — 'hub' iff a plugin_hub_link row exists, fully redundant
// otherwise. Keep this expression identical everywhere it's used.
const SOURCE_TYPE_CASE = `CASE WHEN phl.id IS NOT NULL THEN 'hub' ELSE 'local' END`;

export class PluginService {
  static async getAll() {
    const knex = PluginModel.knex();
    return await knex('plugin')
      .leftJoin('plugin_hub_link as phl', 'phl.plugin_id', 'plugin.id')
      .select(
        'plugin.identifier',
        'plugin.group',
        'plugin.name',
        'plugin.description',
        'plugin.author',
        'plugin.version',
        'plugin.enabled',
        'plugin.status',
        'plugin.path',
        'plugin.image',
        knex.raw(`${SOURCE_TYPE_CASE} as source_type`),
        'phl.hub_id',
        'phl.hub_plugin_identifier',
        'phl.hub_version'
      );
  }

  static async getByIdentifier(identifier: string) {
    const knex = PluginModel.knex();
    const row = await knex('plugin')
      .leftJoin('plugin_hub_link as phl', 'phl.plugin_id', 'plugin.id')
      .leftJoin('hub', 'hub.id', 'phl.hub_id')
      .select(
        'plugin.*',
        knex.raw(`${SOURCE_TYPE_CASE} as source_type`),
        'phl.hub_id',
        'phl.hub_plugin_identifier',
        'phl.hub_version',
        'phl.hub_status',
        'phl.auto_update',
        'phl.last_synced_at',
        'hub.name as hub_name'
      )
      .where('plugin.identifier', identifier)
      .first();

    return row ? { ...row, hub_update_state: hubUpdateState(row.version, row.hub_version) } : null;
  }

  static async getByGroup(group: string) {
    return await PluginModel.query().findOne({ group });
  }

  static async registerOrUpdate(data: {
    group: string;
    name: string;
    description?: string;
    author?: string;
    version?: string;
    path: string;
    image?: string;
  }) {
    const existing = await PluginModel.query().findOne({ group: data.group });
    if (existing) {
      return await PluginModel.query().patchAndFetchById(existing.id, {
        name: data.name,
        description: data.description,
        author: data.author,
        version: data.version,
        path: data.path,
        image: data.image,
        status: 'ok',
      });
    }
    return await PluginModel.query().insert({
      identifier: generateIdentifier(),
      enabled: false,
      status: 'ok',
      ...data,
    });
  }

  /** Backfills an image from the hub catalog, only when the plugin's own code didn't declare one. */
  static async setImageIfMissing(identifier: string, relativePath: string) {
    const plugin = await PluginModel.query().findOne({ identifier });
    if (!plugin || plugin.image) return;
    await PluginModel.query().patch({ image: relativePath }).where({ identifier });
  }

  static async setEnabled(identifier: string, enabled: boolean) {
    const count = await PluginModel.query().patch({ enabled }).where({ identifier });
    if (!count) return null;
    return PluginModel.query().findOne({ identifier });
  }

  static async remove(identifier: string) {
    return await PluginModel.query().delete().where({ identifier });
  }

  static async getByHubRef(hubId: string, hubPluginIdentifier: string) {
    const knex = PluginModel.knex();
    return await knex('plugin')
      .innerJoin('plugin_hub_link as phl', 'phl.plugin_id', 'plugin.id')
      .where({ 'phl.hub_id': hubId, 'phl.hub_plugin_identifier': hubPluginIdentifier })
      .select('plugin.*', 'phl.hub_id', 'phl.hub_plugin_identifier', 'phl.hub_version', 'phl.hub_status', 'phl.auto_update')
      .first();
  }

  /**
   * Marks a plugin row as hub-installed. Called once right after the archive has
   * been extracted and `npm install` has succeeded, right after `registerOrUpdate`
   * (via the disk rescan) has already created the base plugin row — this only
   * creates the plugin_hub_link row, kept in a separate table so a routine
   * `PluginLoader.load()` scan, which only ever touches the `plugin` table's own
   * columns, can never clobber it.
   */
  static async markHubInstalled(
    group: string,
    data: { hub_id: string; hub_user?: string; hub_plugin_identifier: string; hub_version: string; auto_update?: boolean }
  ) {
    const plugin = await PluginModel.query().findOne({ group });
    if (!plugin) return null;

    await PluginHubLink.query().insert({
      plugin_id: plugin.id,
      hub_id: data.hub_id,
      hub_user: data.hub_user,
      hub_plugin_identifier: data.hub_plugin_identifier,
      hub_version: data.hub_version,
      hub_status: 'ok',
      auto_update: data.auto_update ?? true,
      last_synced_at: new Date().toISOString(),
    } as any);

    return PluginService.getByIdentifier(plugin.identifier);
  }

  /** Every plugin installed from a given hub — used to detect ones whose catalog entry disappeared. */
  static async getInstalledForHub(hubId: string) {
    const knex = PluginModel.knex();
    return await knex('plugin_hub_link as phl')
      .innerJoin('plugin', 'plugin.id', 'phl.plugin_id')
      .where('phl.hub_id', hubId)
      .select(
        'plugin.identifier',
        'plugin.name',
        'plugin.version',
        'phl.hub_plugin_identifier',
        'phl.hub_version',
        'phl.auto_update',
        'phl.hub_status'
      );
  }

  static async setHubStatus(identifier: string, status: 'ok' | 'missing' | 'error') {
    const plugin = await PluginModel.query().findOne({ identifier }).select('id');
    if (!plugin) return;
    await PluginHubLink.query().patch({ hub_status: status } as any).where({ plugin_id: plugin.id });
  }

  static async markSynced(identifier: string, hubVersion: string) {
    const plugin = await PluginModel.query().findOne({ identifier }).select('id');
    if (!plugin) return null;
    const count = await PluginHubLink.query()
      .patch({ hub_version: hubVersion, last_synced_at: new Date().toISOString() } as any)
      .where({ plugin_id: plugin.id });
    if (!count) return null;
    return PluginService.getByIdentifier(identifier);
  }

  static async setAutoUpdate(identifier: string, autoUpdate: boolean) {
    const plugin = await PluginModel.query().findOne({ identifier }).select('id');
    if (!plugin) return null;
    const count = await PluginHubLink.query().patch({ auto_update: autoUpdate }).where({ plugin_id: plugin.id });
    if (!count) return null;
    return PluginService.getByIdentifier(identifier);
  }

  /** Refreshes just the "latest known at hub" version, without applying anything — drives the "update available" badge when auto_update is off. */
  static async setHubVersion(identifier: string, hubVersion: string) {
    const plugin = await PluginModel.query().findOne({ identifier }).select('id');
    if (!plugin) return null;
    const count = await PluginHubLink.query().patch({ hub_version: hubVersion } as any).where({ plugin_id: plugin.id });
    if (!count) return null;
    return PluginService.getByIdentifier(identifier);
  }

  /**
   * Flags plugins as `missing` when a scan can't reconfirm them — their
   * folder was deleted, or its exported `group` changed so the scan
   * registered a new row under the new group and left this one behind. The
   * row (and the fact it once existed) is kept; only an explicit `remove()`
   * call deletes it, so an intentional deletion doesn't silently erase the
   * listing along with the folder.
   */
  static async markMissingByGroups(groups: string[]) {
    if (!groups.length) return;
    await PluginModel.query().patch({ status: 'missing' }).whereIn('group', groups);
  }
}
