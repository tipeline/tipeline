import { Model } from 'objection';

export class Settings extends Model {
  key!: string;
  value!: string;

  static get tableName() {
    return 'settings';
  }

  static get idColumn() {
    return 'key';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['key', 'value'],
      properties: {
        key: { type: 'string' },
        value: { type: 'string' },
      },
    };
  }
}
