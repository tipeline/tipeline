import { Model } from 'objection';

export class AppHubLink extends Model {
  id!: number;
  app_id!: number;
  hub_id!: string;
  hub_app_identifier!: string;
  hub_user?: string;
  hub_version?: string;
  hub_status?: 'ok' | 'missing' | 'error';
  auto_update!: boolean;
  last_synced_at?: Date;
  created_at!: Date;
  updated_at!: Date;

  static get tableName() {
    return 'app_hub_link';
  }
}
