import { Model } from 'objection';

export class TaskHubLink extends Model {
  id!: number;
  task_id!: number;
  hub_id!: string;
  hub_task_identifier!: string;
  hub_user?: string;
  hub_version?: string;
  hub_status?: 'ok' | 'missing' | 'error';
  auto_update!: boolean;
  last_synced_at?: Date;
  created_at!: Date;
  updated_at!: Date;

  static get tableName() {
    return 'task_hub_link';
  }
}
