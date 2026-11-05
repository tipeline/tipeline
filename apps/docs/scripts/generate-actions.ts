#!/usr/bin/env node
/**
 * Generates apps/docs/actions/<group>.md for every action group.
 *
 * Sources:
 *   - JSDoc (description, @returns, @example) from apps/core/src/action/actions/*\/actions.ts
 *   - Parameter types from @tipeline/schemas Zod schemas (runtime schema)
 *   - Field descriptions from validation.runtime.fieldConfig
 *   - Group label from getGroupMeta()
 *   - Section grouping from `// -----\n// Name\n// -----` comment blocks
 *
 * Run: npm run generate   (from apps/docs/)
 * Or:  npx tsx scripts/generate-actions.ts
 */

import { Project } from 'ts-morph';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '../../..');
const ACTIONS_SRC = path.join(ROOT, 'apps/core/src/action/actions');
const DOCS_ACTIONS = path.join(ROOT, 'apps/docs/actions');
const SCHEMAS_DIST = path.join(ROOT, 'packages/schemas/dist/index.js');

// ─── Zod type introspection ───────────────────────────────────────────────────

function unwrapSchema(schema: any): any {
  if (!schema?._def) return schema;
  const tn: string = schema._def.typeName ?? '';
  if (tn === 'ZodOptional' || tn === 'ZodNullable' || tn === 'ZodDefault') {
    return unwrapSchema(schema._def.innerType);
  }
  if (tn === 'ZodEffects') {
    // z.preprocess / z.refine / z.coerce — look inside
    return unwrapSchema(schema._def.schema);
  }
  return schema;
}

function zodTypeToString(schema: any): string {
  if (!schema?._def) return 'any';
  const core = unwrapSchema(schema);
  const tn: string = core?._def?.typeName ?? '';
  switch (tn) {
    case 'ZodString':
      return 'string';
    case 'ZodNumber':
      return 'number';
    case 'ZodBoolean':
      return 'boolean';
    case 'ZodAny':
      return 'any';
    case 'ZodUnknown':
      return 'unknown';
    case 'ZodNull':
      return 'null';
    case 'ZodArray':
      return `${zodTypeToString(core._def.type)}[]`;
    case 'ZodObject':
      return 'object';
    case 'ZodRecord':
      return 'Record&lt;string, any&gt;';
    case 'ZodEnum': {
      const values: string[] = core._def.values;
      return values.map((v) => `\`${v}\``).join(' \\| ');
    }
    case 'ZodUnion': {
      const types: string[] = (core._def.options as any[]).map(zodTypeToString);
      const unique = [...new Set(types)];
      return unique.join(' \\| ');
    }
    case 'ZodLiteral':
      return `\`${core._def.value}\``;
    case 'ZodTuple':
      return 'tuple';
    default:
      return tn ? tn.replace('Zod', '').toLowerCase() : 'any';
  }
}

function isRequired(schema: any): boolean {
  if (!schema?._def) return true;
  const tn: string = schema._def.typeName ?? '';
  return tn !== 'ZodOptional' && tn !== 'ZodDefault';
}

function getDefaultValue(schema: any): string | null {
  if (!schema?._def) return null;
  if (schema._def.typeName === 'ZodDefault') {
    try {
      const val = schema._def.defaultValue();
      if (val === undefined || val === null) return null;
      return JSON.stringify(val);
    } catch {
      return null;
    }
  }
  return null;
}

interface ParamRow {
  name: string;
  type: string;
  required: boolean;
  defaultVal: string | null;
  description: string;
}

function schemaToParamRows(schema: any, fieldConfig?: Record<string, any>): ParamRow[] {
  const unwrapped = unwrapSchema(schema);
  if (!unwrapped?.shape) return [];

  return Object.entries(unwrapped.shape).map(([name, fieldSchema]: [string, any]) => ({
    name,
    type: zodTypeToString(fieldSchema),
    required: isRequired(fieldSchema),
    defaultVal: getDefaultValue(fieldSchema),
    description: fieldConfig?.[name]?.description ?? '',
  }));
}

// ─── JSDoc parsing ────────────────────────────────────────────────────────────

interface ParsedJsDoc {
  description: string;
  returns: string;
  exampleYaml: string;
}

function parseJsDocText(rawText: string): ParsedJsDoc {
  // Strip /** / */ markers and leading " * " from every line
  const stripped = rawText
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .replace(/^[ \t]*\*[ \t]?/gm, '')
    .trim();

  // Description: everything before the first @tag line
  const firstTagIdx = stripped.search(/^@\w+/m);
  const description = (firstTagIdx >= 0 ? stripped.substring(0, firstTagIdx) : stripped).trim();

  // @returns: grab text until the next @tag or end of string
  const returnsMatch = stripped.match(/@returns\s+([\s\S]*?)(?=\n@\w+|$)/);
  const returns = returnsMatch ? returnsMatch[1].trim() : '';

  // @example: extract the YAML block between ```yaml and ```
  const exampleMatch = stripped.match(/@example[\s\S]*?```yaml\n([\s\S]*?)```/);
  const exampleYaml = exampleMatch ? exampleMatch[1] : '';

  return { description, returns, exampleYaml };
}

// ─── Section header detection ─────────────────────────────────────────────────

interface Section {
  name: string;
  pos: number;
}

function findSections(sourceText: string): Section[] {
  // Matches: // ------...\n  // Section Name\n  // ------...
  const re = /\/\/ -{5,}\n[ \t]*\/\/ (.+?)\n[ \t]*\/\/ -{5,}/g;
  const sections: Section[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sourceText)) !== null) {
    sections.push({ name: m[1].trim(), pos: m.index });
  }
  return sections;
}

function getSectionAt(sections: Section[], methodPos: number): string {
  let current = '';
  for (const s of sections) {
    if (s.pos < methodPos) current = s.name;
    else break;
  }
  return current;
}

// ─── Markdown builders ────────────────────────────────────────────────────────

// Field descriptions are plain text from the schemas: keep `<p>`-like text and pipes from
// being read as HTML (Vue would try to compile it) or as table columns.
function escapeTableText(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|');
}

function buildParamTable(rows: ParamRow[]): string {
  if (rows.length === 0) return '';
  const header = '| Parameter | Type | Required | Default | Description |\n|-----------|------|:--------:|---------|-------------|';
  const lines = rows.map((r) => {
    const req = r.required ? '✓' : '';
    const def = r.defaultVal ?? '—';
    const desc = escapeTableText(r.description) || '—';
    return `| \`${r.name}\` | ${r.type} | ${req} | ${def} | ${desc} |`;
  });
  return `${header}\n${lines.join('\n')}`;
}

// ─── Per-group doc generator ──────────────────────────────────────────────────

function generateGroupDoc(
  group: string,
  actionsFile: string,
  groupValidations: Record<string, any>,
  groupMeta: { label: string; icon?: string }
): string {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });
  const sf = project.addSourceFileAtPath(actionsFile);
  const sourceText = sf.getFullText();
  const sections = findSections(sourceText);

  const cls = sf.getClasses()[0];
  if (!cls) return '';

  // Only include static methods whose name appears in the validations object
  const methods = cls.getStaticMethods().filter((m) => {
    const name = m.getName();
    return name && groupValidations[name];
  });

  if (methods.length === 0) return '';

  // Group methods by section, preserving order
  const ordered: { section: string; methods: typeof methods }[] = [];
  const sectionMap = new Map<string, (typeof methods)[number][]>();

  for (const method of methods) {
    const sectionName = getSectionAt(sections, method.getPos()) || 'General';
    if (!sectionMap.has(sectionName)) {
      sectionMap.set(sectionName, []);
      ordered.push({ section: sectionName, methods: sectionMap.get(sectionName)! });
    }
    sectionMap.get(sectionName)!.push(method);
  }

  const out: string[] = [
    `<!-- AUTO-GENERATED: Do not edit manually. Run \`npm run generate\` to regenerate. -->`,
    '',
    `# ${groupMeta.label} Actions`,
    '',
  ];

  for (const { section, methods: sectionMethods } of ordered) {
    out.push(`## ${section}`);
    out.push('');

    for (const method of sectionMethods) {
      const name = method.getName()!;
      const validation = groupValidations[name];

      const jsDocs = method.getJsDocs();
      const doc =
        jsDocs.length > 0
          ? parseJsDocText(jsDocs[0].getText())
          : { description: '', returns: '', exampleYaml: '' };

      const description = doc.description || validation?.runtime?.description || '';

      out.push(`### \`${name}\``);
      out.push('');

      if (description) {
        out.push(description);
        out.push('');
      }

      if (doc.returns) {
        out.push(`**Returns:** ${doc.returns}`);
        out.push('');
      }

      const runtimeSchema = validation?.runtime?.schema;
      if (runtimeSchema) {
        const rows = schemaToParamRows(runtimeSchema, validation?.runtime?.fieldConfig);
        if (rows.length > 0) {
          out.push(buildParamTable(rows));
          out.push('');
        }
      }

      if (doc.exampleYaml) {
        out.push('```yaml');
        out.push(doc.exampleYaml.trimEnd());
        out.push('```');
        out.push('');
      }
    }
  }

  return out.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(SCHEMAS_DIST)) {
    console.error(`\nSchemas dist not found: ${SCHEMAS_DIST}`);
    console.error('Run first: npm -w packages/schemas run build\n');
    process.exit(1);
  }

  const { getGroupValidations, getGroupMeta } = (await import(
    pathToFileURL(SCHEMAS_DIST).href
  )) as any;

  const groups = fs
    .readdirSync(ACTIONS_SRC)
    .filter((f) => fs.statSync(path.join(ACTIONS_SRC, f)).isDirectory())
    .sort();

  let generated = 0;

  for (const group of groups) {
    const actionsFile = path.join(ACTIONS_SRC, group, 'actions.ts');
    if (!fs.existsSync(actionsFile)) {
      console.log(`  skip  ${group} (no actions.ts)`);
      continue;
    }

    let groupValidations: Record<string, any> = {};
    let groupMeta: { label: string; icon?: string } = { label: group };

    try {
      groupValidations = getGroupValidations(group) ?? {};
      groupMeta = getGroupMeta(group) ?? groupMeta;
    } catch {
      console.warn(`  warn  ${group}: could not load schemas`);
    }

    const markdown = generateGroupDoc(group, actionsFile, groupValidations, groupMeta);
    if (!markdown) {
      console.log(`  skip  ${group} (no public actions found)`);
      continue;
    }

    const outPath = path.join(DOCS_ACTIONS, `${group}.md`);
    fs.writeFileSync(outPath, markdown, 'utf8');
    console.log(`  ✓     ${group}.md`);
    generated++;
  }

  console.log(`\nGenerated ${generated} action docs.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
