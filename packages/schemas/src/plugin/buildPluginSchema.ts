// buildPluginSchema.ts
//
// Translates a plugin's declarative PluginParamDef[] array (+ optional
// cross-field PluginFieldRule[]) into a real Zod schema — the same kind of
// object core actions get from createValidationPair's 'creation' side. This
// is imported directly by both apps/core (PluginLoader, to build the schema
// ActionFactory enforces) and apps/desktop (pluginStore, to build the exact
// same schema client-side for live form validation) — never sent over IPC,
// since a ZodType isn't serializable. Only the plain PluginParamDef[]/
// PluginFieldRule[] JSON crosses that boundary; each side derives its own
// (identical) schema from it.
import { z, ZodTypeAny } from 'zod';
import type { PluginParamDef, PluginFieldRule } from '@tipeline/types';
import { orTemplateString } from '../templateValidation';

function concreteFieldSchema(def: PluginParamDef): ZodTypeAny {
  switch (def.type) {
    case 'number': {
      let num = z.coerce.number();
      if (def.min !== undefined) num = num.min(def.min);
      if (def.max !== undefined) num = num.max(def.max);
      if (def.precision === undefined) return num;
      const factor = 10 ** def.precision;
      return num.refine((n) => Math.round(n * factor) === Number((n * factor).toFixed(6)), {
        message: `must have at most ${def.precision} decimal place(s)`,
      });
    }
    case 'boolean':
      return z.coerce.boolean();
    case 'date':
      return z.string().refine((v) => !Number.isNaN(Date.parse(v)), {
        message: 'must be a valid date',
      });
    case 'html':
      return z.string();
    case 'variable':
      // Live object reference (browser session, DB handle, ...) resolved from
      // a {= name =} template — typing it further would just degrade to any().
      return z.any();
    case 'string':
    default: {
      if (def.enum && def.enum.length > 0) {
        return z.enum(def.enum as [string, ...string[]]);
      }
      let str = z.string();
      if (def.min !== undefined) str = str.min(def.min);
      if (def.max !== undefined) str = str.max(def.max);
      if (def.pattern !== undefined) str = str.regex(new RegExp(def.pattern));
      return str;
    }
  }
}

function fieldToZod(def: PluginParamDef): ZodTypeAny {
  // 'variable' fields are already either a live value or a raw {= x =}
  // string handled by concreteFieldSchema's z.any() — no need to also wrap
  // them in the {{ }} template-string union below.
  const base =
    def.type === 'variable' ? concreteFieldSchema(def) : orTemplateString(concreteFieldSchema(def));
  const withDefault = def.default !== undefined ? base.default(def.default) : base;
  return def.required ? withDefault : withDefault.optional();
}

/**
 * Builds a Zod object schema from a plugin action's flat param definitions,
 * optionally tightened by cross-field rules. Validated at creation time
 * (before {{ }} / {= =} resolution) — same timing as core actions' 'creation'
 * schemas, so a rule only fires when the field it inspects is a literal, not
 * a still-unresolved template placeholder.
 */
export function buildPluginSchema(
  defs: PluginParamDef[] = [],
  rules: PluginFieldRule[] = []
): ZodTypeAny {
  const shape: Record<string, ZodTypeAny> = {};
  for (const def of defs) {
    shape[def.name] = fieldToZod(def);
  }
  const objectSchema = z.object(shape);

  if (rules.length === 0) return objectSchema;

  return objectSchema.superRefine((data, ctx) => {
    for (const rule of rules) {
      if ((data as Record<string, any>)?.[rule.when.field] !== rule.when.equals) continue;
      for (const field of rule.require) {
        const val = (data as Record<string, any>)?.[field];
        if (val === undefined || val === null || val === '') {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `"${field}" is required when "${rule.when.field}" is ${JSON.stringify(rule.when.equals)}`,
            path: [field],
          });
        }
      }
    }
  });
}
