import { Model } from 'objection';

export type HubItemType = 'task' | 'app' | 'plugin';
export type HubAttentionKind =
  | 'major_waiting'
  | 'update_available'
  | 'older_listed'
  | 'blocked'
  | 'not_bumped'
  | 'failed';
export type HubUpdateEventKind = 'updated' | HubAttentionKind;

export class HubUpdateEvent extends Model {
  id!: number;
  item_type!: HubItemType;
  item_identifier!: string;
  item_name?: string | null;
  hub_name?: string | null;
  kind!: HubUpdateEventKind;
  from_version?: string | null;
  to_version?: string | null;
  message?: string | null;
  read_at?: string | null;
  created_at!: string;

  static get tableName() {
    return 'hub_update_event';
  }

  static get idColumn() {
    return 'id';
  }
}
