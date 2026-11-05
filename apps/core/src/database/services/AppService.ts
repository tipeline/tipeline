import { hubUpdateState } from '@/hub/HubUpdatePolicy';
import { App as AppModel } from '@/database/models/App';
import { AppHubLink } from '@/database/models/AppHubLink';
import { generateIdentifier } from '@tipeline/utils';

// Every query that lists/details an app computes this instead of reading a
// stored column — 'hub' iff an app_hub_link row exists, fully redundant
// otherwise. Keep this expression identical everywhere it's used.
const SOURCE_TYPE_CASE = `CASE WHEN ahl.id IS NOT NULL THEN 'hub' ELSE 'local' END`;

type HubInstallData = {
  name: string;
  description?: string;
  author?: string;
  version?: string;
  metadata?: any;
  source?: string;
  hub_id: string;
  hub_user?: string;
  hub_app_identifier: string;
  hub_version: string;
  auto_update?: boolean;
};

export class AppService {
  static async install({
    name,
    description,
    author,
    version,
    metadata,
    source,
  }: {
    name: string;
    description?: string;
    author?: string;
    version?: string;
    metadata?: any;
    source?: string;
  }) {
    return await AppModel.query().insert({
      identifier: generateIdentifier(),
      name,
      description,
      author,
      version,
      metadata,
      source,
    });
  }

  static async installFromHub(data: HubInstallData) {
    const record = await AppModel.transaction(async (trx) => {
      const app = await AppModel.query(trx).insert({
        identifier: generateIdentifier(),
        name: data.name,
        description: data.description,
        author: data.author,
        version: data.version,
        metadata: data.metadata,
        source: data.source,
      });

      await AppHubLink.query(trx).insert({
        app_id: app.id,
        hub_id: data.hub_id,
        hub_user: data.hub_user,
        hub_app_identifier: data.hub_app_identifier,
        hub_version: data.hub_version,
        hub_status: 'ok',
        auto_update: data.auto_update ?? true,
        last_synced_at: new Date().toISOString(),
      } as any);

      return app;
    });

    return AppService.getByIdentifier(record.identifier);
  }

  static async getAll() {
    const knex = AppModel.knex();
    return await knex('app')
      .leftJoin('project', 'project.id', 'app.project_id')
      .leftJoin('app_hub_link as ahl', 'ahl.app_id', 'app.id')
      .select(
        'app.identifier',
        'app.name',
        'app.description',
        'app.author',
        'app.version',
        knex.raw(`json_extract(app.metadata, '$.image') as image`),
        knex.raw(`${SOURCE_TYPE_CASE} as source_type`),
        'ahl.hub_id',
        'ahl.hub_app_identifier',
        'ahl.hub_version',
        'app.project_id',
        'project.identifier as project_identifier',
      )
      .orderBy('app.created_at', 'desc');
  }

  static async getByIdentifier(identifier: string) {
    const knex = AppModel.knex();
    const row = await knex('app')
      .leftJoin('project', 'project.id', 'app.project_id')
      .leftJoin('app_hub_link as ahl', 'ahl.app_id', 'app.id')
      .leftJoin('hub', 'hub.id', 'ahl.hub_id')
      .select(
        'app.*',
        'project.identifier as project_identifier',
        knex.raw(`${SOURCE_TYPE_CASE} as source_type`),
        'ahl.hub_id',
        'ahl.hub_app_identifier',
        'ahl.hub_version',
        'ahl.hub_status',
        'ahl.auto_update',
        'ahl.last_synced_at',
        'hub.name as hub_name'
      )
      .where('app.identifier', identifier)
      .first();

    return row
      ? {
          ...row,
          metadata: row.metadata ? JSON.parse(row.metadata) : row.metadata,
          hub_update_state: hubUpdateState(row.version, row.hub_version),
        }
      : row;
  }

  static async getByHubRef(hubId: string, hubAppIdentifier: string) {
    const knex = AppModel.knex();
    return await knex('app')
      .innerJoin('app_hub_link as ahl', 'ahl.app_id', 'app.id')
      .where({ 'ahl.hub_id': hubId, 'ahl.hub_app_identifier': hubAppIdentifier })
      .select('app.*', 'ahl.hub_id', 'ahl.hub_app_identifier', 'ahl.hub_version', 'ahl.hub_status', 'ahl.auto_update')
      .first();
  }

  /** Every app installed from a given hub — used to detect ones whose catalog entry disappeared. */
  static async getInstalledForHub(hubId: string) {
    const knex = AppModel.knex();
    return await knex('app_hub_link as ahl')
      .innerJoin('app', 'app.id', 'ahl.app_id')
      .where('ahl.hub_id', hubId)
      .select(
        'app.identifier',
        'app.name',
        'app.version',
        'ahl.hub_app_identifier',
        'ahl.hub_version',
        'ahl.auto_update',
        'ahl.hub_status'
      );
  }

  static async setHubStatus(identifier: string, status: 'ok' | 'missing' | 'error') {
    const app = await AppModel.query().findOne({ identifier }).select('id');
    if (!app) return;
    await AppHubLink.query().patch({ hub_status: status } as any).where({ app_id: app.id });
  }

  static async uninstall(identifier: string) {
    return await AppModel.query().delete().where({ identifier });
  }

  static async updateSource(identifier: any, source: any) {
    const count = await AppModel.query().patch({ source }).where({ identifier });
    if (!count) return null;
    return AppModel.query().findOne({ identifier });
  }

  static async markSynced(
    identifier: string,
    data: { name?: string; description?: string; author?: string; version?: string; source?: string; hubVersion: string }
  ) {
    const app = await AppModel.query().findOne({ identifier }).select('id');
    if (!app) return null;

    await AppModel.query()
      .patch({
        name: data.name,
        description: data.description,
        author: data.author,
        version: data.version,
        source: data.source,
      })
      .where({ identifier });
    await AppHubLink.query()
      .patch({ hub_version: data.hubVersion, last_synced_at: new Date().toISOString() } as any)
      .where({ app_id: app.id });

    return AppService.getByIdentifier(identifier);
  }

  /** Refreshes just the "latest known at hub" version, without applying anything — drives the "update available" badge when auto_update is off. */
  static async setHubVersion(identifier: string, hubVersion: string) {
    const app = await AppModel.query().findOne({ identifier }).select('id');
    if (!app) return null;
    const count = await AppHubLink.query().patch({ hub_version: hubVersion } as any).where({ app_id: app.id });
    if (!count) return null;
    return AppService.getByIdentifier(identifier);
  }

  static async setAutoUpdate(identifier: string, autoUpdate: boolean) {
    const app = await AppModel.query().findOne({ identifier }).select('id');
    if (!app) return null;
    const count = await AppHubLink.query().patch({ auto_update: autoUpdate }).where({ app_id: app.id });
    if (!count) return null;
    return AppService.getByIdentifier(identifier);
  }

  static async updateMeta(
    identifier: string,
    data: { name?: string; description?: string; author?: string; version?: string; platform?: string }
  ) {
    const record = await AppModel.query().findOne({ identifier });
    if (!record) throw new Error(`App not found: ${identifier}`);

    if (Object.keys(data).length) {
      await AppModel.query().findOne({ identifier }).patch(data);
    }

    return AppService.getByIdentifier(identifier);
  }

  /** Read-modify-write of the `metadata` JSON column — the only place an App's image lives. */
  static async updateImage(identifier: string, relativePath: string | null) {
    const record = await AppModel.query().findOne({ identifier });
    if (!record) throw new Error(`App not found: ${identifier}`);

    const metadata = { ...(record.metadata ?? {}), image: relativePath ?? undefined };
    if (relativePath === null) delete metadata.image;

    await AppModel.query().findOne({ identifier }).patch({ metadata });
    return AppService.getByIdentifier(identifier);
  }
}
