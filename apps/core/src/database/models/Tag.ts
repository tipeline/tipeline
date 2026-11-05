import { Model } from 'objection';

export class Tag extends Model {
  id!: number;
  label!: string;
  created_at!: Date;

  static get tableName() {
    return 'tag';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['label'],
      properties: {
        id: { type: 'integer' },
        label: { type: 'string' },
        created_at: { type: 'string', format: 'date-time' },
      },
    };
  }
}
