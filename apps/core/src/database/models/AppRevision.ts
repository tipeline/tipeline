import { Model } from 'objection';
import type { RevisionOrigin } from '@database/services/RevisionHistory';

export class AppRevision extends Model {
  id!: number;
  app_id!: number;
  source!: string;
  origin!: RevisionOrigin;
  summary!: string | null;
  restored_from!: number | null;
  created_at!: string;

  static get tableName() {
    return 'app_revision';
  }
}
