// Export types for convenience
export type VariableScope = 'global' | 'task' | 'core' | 'env';
export type VariableVisibility = 'public' | 'protected' | 'private';
export type VariableType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'date'
  | 'array'
  | 'image'
  | 'audio'
  | 'video'
  | 'dbConnection'
  | 'sshConnection'
  | 'browser'
  | 'workbook'
  | 'oauthToken';

export interface VariableObject {
  type: VariableType;
  name: string;
  value?: any;
  valueFromEnv?: string;
  /** Only used alongside valueFromEnv. An optional path (supports a leading `~`) to a dotenv-format file to check for valueFromEnv's key before falling back to process.env — lets a task pin its own env file instead of relying on the shared ~/Tipeline/.env or the process environment. */
  valueFromEnvFile?: string;
  valueFromGlobal?: string;
  required?: boolean;
  description?: string;
  label?: string;
  readonly?: boolean;
  scope?: VariableScope;
  secret?: boolean;
  visibility?: VariableVisibility;
  /** Filled in by the workflow and returned; never set from outside (run forms, the assistant, apps, parent workflows). */
  output?: boolean;
}

// Variable type metadata for display purposes
export const VARIABLE_TYPE_OPTIONS = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'object', label: 'Object' },
  { value: 'date', label: 'Date' },
  { value: 'array', label: 'Array' },
  { value: 'image', label: 'Image' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'dbConnection', label: 'Database Connection' },
  { value: 'sshConnection', label: 'SSH Connection' },
  { value: 'browser', label: 'Browser' },
  { value: 'workbook', label: 'Workbook' },
] as const;
