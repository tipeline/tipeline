import { Model } from 'objection';

export type RevisionOrigin = 'edit' | 'created' | 'hub' | 'reload' | 'backup' | 'restore' | 'earlier';

export class TaskRevision extends Model {
  id!: number;
  task_id!: number;
  source!: string;
  origin!: RevisionOrigin;
  summary!: string | null;
  restored_from!: number | null;
  created_at!: string;

  static get tableName() {
    return 'task_revision';
  }
}
