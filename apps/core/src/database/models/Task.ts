import { Model } from 'objection';

export class Task extends Model {
  id!: number;
  identifier!: string;
  name!: string;
  description?: string;
  author?: string;
  version?: string;
  platform?: 'windows' | 'linux' | 'macos';
  metadata?: Record<string, any>;
  source?: string;
  project_id?: number | null;
  created_at!: Date;
  updated_at!: Date;

  static get tableName() {
    return 'task';
  }

  static get jsonAttributes() {
    return ['metadata'];
  }

  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name'],
      properties: {
        id: { type: 'integer' },
        identifier: { type: 'string' },
        name: { type: 'string' },
        description: { type: ['string', 'null'] },
        author: { type: ['string', 'null'] },
        version: { type: ['string', 'null'] },
        platform: { type: ['string', 'null'], enum: ['windows', 'linux', 'macos', null] },
        metadata: { type: ['object', 'null'] },
        source: { type: ['string', 'null'] },
        project_id: { type: ['integer', 'null'] },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    };
  }
}
