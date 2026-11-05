import { Model } from 'objection';

export class GlobalVariable extends Model {
  id!: number;
  identifier!: string;
  name!: string;
  description?: string;
  type!: string; // see jsonSchema.properties.type.enum below
  value?: string; // stored as JSON string for complex types
  metadata?: Record<string, any>;
  secret!: boolean;
  readonly!: boolean;
  created_by?: string;
  created_at!: Date;
  updated_at!: Date;

  static get tableName() {
    return 'global_variable';
  }

  // Optional: Define the JSON schema for better type safety and validation
  static get jsonSchema() {
    return {
      type: 'object',
      required: ['identifier', 'name', 'type'],
      properties: {
        id: { type: 'integer' },
        identifier: { type: 'string', maxLength: 21 },
        name: { type: 'string' },
        description: { type: ['string', 'null'] },
        type: {
          type: 'string',
          // Kept in sync with globalTypeOptions in packages/schemas/src/Var.ts. 'datatable'
          // is a legacy value with no current UI-facing equivalent, kept for
          // backward compatibility with any variable already stored as that type.
          // browser/sshConnection/dbConnection/image are deliberately excluded — they
          // hold live, non-serializable handles that can't survive as DB-durable
          // global state (see apps/core/src/utils/nonSerializableTypes.ts).
          enum: [
            'string', 'number', 'boolean', 'date', 'array', 'object', 'datatable',
            'workbook', 'oauthToken', 'audio', 'video',
          ],
        },
        value: { type: ['string', 'null'] },
        metadata: { type: ['object', 'null'] },
        secret: { type: 'boolean', default: false },
        readonly: { type: 'boolean', default: false },
        created_by: { type: ['string', 'null'] },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    };
  }
}
