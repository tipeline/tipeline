import { Model } from 'objection';

export class App extends Model {
  id!: number;
  identifier!: string;
  name!: string;
  description?: string;
  author?: string;
  version?: string;
  metadata?: Record<string, any>;
  source?: string;
  project_id?: number | null;
  created_at!: Date;
  updated_at!: Date;

  static get tableName() {
    return 'app';
  }

  static get jsonAttributes() {
    return ['metadata'];
  }

  // Optional: Define the JSON schema for better type safety and validation
  static get jsonSchema() {
    return {
      type: 'object',
      required: ['name'],
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: ['string', 'null'] },
        author: { type: ['string', 'null'] },
        version: { type: ['string', 'null'] },
        metadata: { type: ['object', 'null'] },
        project_id: { type: ['integer', 'null'] },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    };
  }
}
