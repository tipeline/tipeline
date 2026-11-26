import { Model } from 'objection';
import type { RevisionOrigin } from '@database/services/RevisionHistory';

export type { RevisionOrigin };

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
