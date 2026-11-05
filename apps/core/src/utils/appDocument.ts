import { coreValidations } from '@tipeline/schemas';

const META_KEYS = [
  'name',
  'description',
  'author',
  'version',
  'image',
  'tags',
  'platform',
] as const;

export interface AppDocumentParts {
  name: string;
  description?: string;
  author?: string;
  version: string;
  /** Validated v2 source, serialized for the `app.source` column. */
  source: string;
}

/**
 * Splits an app document (the YAML/JSON file a user installs or a hub serves) into
 * its metadata and its source. Everything that isn't metadata is the source, which
 * is migrated (if v1) and validated — so an install fails up front on a broken app
 * instead of storing something the desktop can't render.
 */
export function splitAppDocument(doc: any, fallbackVersion = '1.0.0'): AppDocumentParts {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('App document must be an object');
  }
  // A workflow file picked in "Install App" by mistake: say so instead of listing
  // every schema mismatch between a workflow and an app.
  if (doc.pipeline !== undefined && doc.pages === undefined) {
    throw new Error('This file is a workflow, not an app — install it from Workflows instead.');
  }
  if (!doc.name) throw new Error('App YAML must include a name field');

  const version = typeof doc.version === 'string' && doc.version ? doc.version : fallbackVersion;
  const rest: Record<string, unknown> = { ...doc };
  for (const key of META_KEYS) delete rest[key];

  const source = coreValidations.appObject.parseAppSource({ ...rest, version });
  return {
    name: doc.name,
    description: doc.description,
    author: doc.author,
    version,
    source: JSON.stringify(source),
  };
}
