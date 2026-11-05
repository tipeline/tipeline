import { Model } from 'objection';

export class Plugin extends Model {
  id!: number;
  identifier!: string;
  group!: string;
  name!: string;
  description?: string;
  author?: string;
  version?: string;
  enabled!: boolean;
  status!: string;
  path!: string;
  image?: string;
  created_at!: Date;
  updated_at!: Date;

  static get tableName() {
    return 'plugin';
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['group', 'name', 'path'],
      properties: {
        id: { type: 'integer' },
        identifier: { type: 'string' },
        group: { type: 'string' },
        name: { type: 'string' },
        description: { type: ['string', 'null'] },
        author: { type: ['string', 'null'] },
        version: { type: ['string', 'null'] },
        enabled: { type: 'boolean' },
        status: { type: 'string' },
        path: { type: 'string' },
        image: { type: ['string', 'null'] },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    };
  }
}
