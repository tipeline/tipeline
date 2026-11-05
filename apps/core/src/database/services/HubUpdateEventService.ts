import {
  HubUpdateEvent,
  type HubAttentionKind,
  type HubItemType,
} from '@database/models/HubUpdateEvent';

export interface HubEventItem {
  type: HubItemType;
  identifier: string;
  name?: string | null;
  hubName?: string | null;
  fromVersion?: string | null;
}

export interface HubAttention {
  kind: HubAttentionKind;
  toVersion?: string | null;
  message?: string | null;
}

const KEEP_UPDATED_EVENTS = 200;

const ITEM_LINKS: Record<HubItemType, { table: string; link: string; fk: string }> = {
  task: { table: 'task', link: 'task_hub_link', fk: 'task_id' },
  app: { table: 'app', link: 'app_hub_link', fk: 'app_id' },
  plugin: { table: 'plugin', link: 'plugin_hub_link', fk: 'plugin_id' },
};

/**
 * The log behind the Updates tab. An `updated` row is history. Any other row says what an
 * item needs from the user right now, so there's at most one per item: it's replaced when
 * the situation changes and removed when it's over, however often the hub is checked.
 */
export class HubUpdateEventService {
  /** Sets what an item currently needs from the user; `null` means nothing. */
  static async setAttention(item: HubEventItem, attention: HubAttention | null) {
    const open = await HubUpdateEvent.query()
      .where({ item_type: item.type, item_identifier: item.identifier })
      .whereNot('kind', 'updated');
    const same = attention
      ? open.find((e) => e.kind === attention.kind && e.to_version === (attention.toVersion ?? null))
      : undefined;

    const stale = open.filter((e) => e !== same).map((e) => e.id);
    if (stale.length) await HubUpdateEvent.query().delete().whereIn('id', stale);
    if (!attention || same) return;

    await HubUpdateEvent.query().insert({
      item_type: item.type,
      item_identifier: item.identifier,
      item_name: item.name ?? null,
      hub_name: item.hubName ?? null,
      kind: attention.kind,
      from_version: item.fromVersion ?? null,
      to_version: attention.toVersion ?? null,
      message: attention.message ?? null,
    } as any);
  }

  /** An update went in. `seen` is for one the user started, which needs no announcing. */
  static async recordUpdated(item: HubEventItem, toVersion: string | null | undefined, seen = false) {
    await this.setAttention(item, null);
    if ((toVersion ?? null) === (item.fromVersion ?? null)) return;

    await HubUpdateEvent.query().insert({
      item_type: item.type,
      item_identifier: item.identifier,
      item_name: item.name ?? null,
      hub_name: item.hubName ?? null,
      kind: 'updated',
      from_version: item.fromVersion ?? null,
      to_version: toVersion ?? null,
      read_at: seen ? new Date().toISOString() : null,
    } as any);

    const old = await HubUpdateEvent.query()
      .where({ kind: 'updated' })
      .orderBy('id', 'desc')
      .offset(KEEP_UPDATED_EVENTS)
      .limit(1000)
      .select('id');
    if (old.length) await HubUpdateEvent.query().delete().whereIn('id', old.map((e) => e.id));
  }

  /** Newest first. Requests about an item that was deleted or left its hub are dropped here. */
  static async list() {
    const knex = HubUpdateEvent.knex();
    const events = await HubUpdateEvent.query().orderBy('id', 'desc');

    const live: HubUpdateEvent[] = [];
    for (const event of events) {
      if (event.kind !== 'updated') {
        const { table, link, fk } = ITEM_LINKS[event.item_type];
        const linked = await knex(table)
          .innerJoin(`${link} as l`, `l.${fk}`, `${table}.id`)
          .where(`${table}.identifier`, event.item_identifier)
          .first(`${table}.id`);
        if (!linked) {
          await HubUpdateEvent.query().deleteById(event.id);
          continue;
        }
      }
      live.push(event);
    }
    return live;
  }

  static async markAllRead() {
    await HubUpdateEvent.query().patch({ read_at: new Date().toISOString() } as any).whereNull('read_at');
  }
}
