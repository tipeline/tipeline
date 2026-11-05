export interface PluginParamDef {
  name: string;
  // 'variable' expects a live value produced by an earlier step (e.g. a browser
  // session or DB handle) rather than a literal — the builder renders it as a
  // variable picker that writes a raw `{= name =}` reference. Set
  // component: 'textarea' on a 'variable' field to render a free-text area
  // instead (e.g. for typing a literal JSON object/array directly) — the
  // builder stores whatever text is typed as-is (a plain string), so an
  // action reading a textarea'd field must parse it itself if it expects a
  // structured value and the text isn't a `{= name =}`/`{{ name }}` reference.
  type: 'string' | 'number' | 'boolean' | 'date' | 'html' | 'variable';
  component?: 'datetime' | 'textarea';
  label?: string;
  description?: string;
  default?: any;
  required?: boolean;
  // Declarative constraints beyond type/required — translated into real Zod
  // checks by @tipeline/schemas's buildPluginSchema, the same function core
  // and the Desktop builder both call to enforce/preview these rules.
  enum?: string[]; // 'string' fields only — also renders as a <Select> in the builder
  pattern?: string; // regex source, 'string' fields only
  min?: number; // 'number': minimum value. 'string': minimum length.
  max?: number; // 'number': maximum value. 'string': maximum length.
  precision?: number; // 'number' fields only — max allowed decimal places
}

// Declarative cross-field rule: when `when.field` equals `when.equals`, every
// field named in `require` must be present. Evaluated at creation time
// (before {{ }} / {= =} template resolution), so a rule only fires when
// `when.field`'s raw value is the literal — not a template placeholder.
export interface PluginFieldRule {
  when: { field: string; equals: any };
  require: string[];
}

export interface PluginActionDocs {
  description?: string;
  example?: string;
}
