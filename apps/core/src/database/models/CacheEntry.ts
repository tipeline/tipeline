import { Model } from 'objection';

export class CacheEntry extends Model {
  key!: string;
  kind!: 'action' | 'workflow';
  owner!: string | null;
  label!: string;
  value!: string;
  size_bytes!: number;
  ttl_seconds!: number;
  hits!: number;
  source_pipeline!: string | null;
  created_at!: string;
  last_hit_at!: string | null;

  static get tableName() {
    return 'cache_entries';
  }

  static get idColumn() {
    return 'key';
  }
}
