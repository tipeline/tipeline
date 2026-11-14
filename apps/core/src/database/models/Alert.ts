import { Model } from 'objection';
import type { AlertLevel } from '@tipeline/schemas';

export type AlertStatus = 'open' | 'dismissed' | 'resolved';

export class Alert extends Model {
  id!: number;
  identifier!: string;
  task_identifier!: string;
  /** The latest run that raised it; null when that run wasn't saved. */
  pipeline_identifier?: string | null;
  key!: string;
  title!: string;
  message?: string | null;
  level!: AlertLevel;
  status!: AlertStatus;
  count!: number;
  first_raised_at!: string;
  last_raised_at!: string;
  closed_at?: string | null;
  closed_by?: string | null;

  static get tableName() {
    return 'alert';
  }

  static get idColumn() {
    return 'id';
  }
}
