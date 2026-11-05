/**
 * Invoicing plugin — demonstrates Tipeline's declarative plugin param
 * validation: a flat PluginParamDef[] array (same as every other plugin)
 * that PluginLoader translates into a real Zod schema via
 * @tipeline/schemas's buildPluginSchema, enforced by ActionFactory at
 * execution time for every invocation path (CLI, IPC, schedules, resumed
 * pipelines) — not just the Desktop builder's Save button. The Desktop
 * builder derives the identical schema client-side from the same JSON, so
 * both sides check the same rules without ever sending a schema over IPC.
 *
 * Install: copy (or symlink) this folder to ~/Tipeline/plugins/invoicing.
 * The core engine loads it automatically on startup (or via a hot-reload
 * call to PluginLoader.reloadSingle for this path).
 *
 * Two actions show the two tiers of the same vocabulary:
 *
 *  - createDraft: bare `required`/`type` fields — the baseline every plugin
 *    already writes today. Nothing extra to learn.
 *
 *  - sendInvoice: adds `pattern` (email format), `enum` (currency — also
 *    renders as a dropdown in the builder instead of free text), `min`/
 *    `precision` (amount), and a top-level `rules` entry expressing "ccEmail
 *    is required when sendCopy is true" — all still plain JSON, no Zod
 *    written by hand.
 *
 * Usage in a task YAML: see examples/plugins/invoicing/invoicing.yml
 */

function requireParam(params, name, actionName) {
  const value = params?.[name];
  if (value === undefined || value === null || value === '') {
    throw new Error(`invoicing.${actionName}: "${name}" param is required`);
  }
  return value;
}

export default {
  group: 'invoicing',
  name: 'Invoicing Plugin',
  description: 'Creates draft invoices and sends finalized invoices to customers.',
  author: 'Tipeline',
  version: '1.0.0',

  actions: {
    async createDraft(params) {
      const customerName = requireParam(params, 'customerName', 'createDraft');
      const notes = params?.notes ?? '';

      return {
        id: `draft-${Date.now()}`,
        customerName,
        notes,
        status: 'draft',
      };
    },

    async sendInvoice(params) {
      // By the time this runs, params has already passed the schema
      // PluginLoader derived from `params.sendInvoice` + `rules.sendInvoice`
      // below — email format, currency enum, amount precision, and the
      // ccEmail-when-sendCopy rule are already guaranteed.
      const invoiceId = requireParam(params, 'invoiceId', 'sendInvoice');
      const customerEmail = requireParam(params, 'customerEmail', 'sendInvoice');
      const amount = requireParam(params, 'amount', 'sendInvoice');
      const currency = requireParam(params, 'currency', 'sendInvoice');
      const sendCopy = params?.sendCopy ?? false;
      const ccEmail = params?.ccEmail;

      return {
        invoiceId,
        sentTo: customerEmail,
        cc: sendCopy ? ccEmail : undefined,
        amount,
        currency,
        status: 'sent',
      };
    },
  },

  // Single source of truth for both the Desktop builder's form AND (via
  // buildPluginSchema) runtime enforcement.
  params: {
    createDraft: [
      { name: 'customerName', type: 'string', label: 'Customer Name', required: true },
      { name: 'notes', type: 'string', label: 'Notes' },
    ],
    sendInvoice: [
      { name: 'invoiceId', type: 'string', label: 'Invoice ID', required: true },
      {
        name: 'customerEmail',
        type: 'string',
        label: 'Customer Email',
        required: true,
        pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
      },
      { name: 'amount', type: 'number', label: 'Amount', required: true, min: 0, precision: 2 },
      {
        name: 'currency',
        type: 'string',
        label: 'Currency',
        required: true,
        enum: ['USD', 'EUR', 'GBP', 'MXN'],
      },
      { name: 'sendCopy', type: 'boolean', label: 'Send a copy to another address', default: false },
      { name: 'ccEmail', type: 'string', label: 'CC Email', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
    ],
  },

  // Cross-field rules, evaluated at creation time (before {{ }} / {= =}
  // resolution) by the same schema the params array feeds.
  rules: {
    sendInvoice: [{ when: { field: 'sendCopy', equals: true }, require: ['ccEmail'] }],
  },

  docs: {
    createDraft: {
      description: 'Creates a draft invoice for a customer.',
      example:
        "- group: invoicing\n  name: createDraft\n  params:\n    customerName: '{{ customer.name }}'\n  destination: draft",
    },
    sendInvoice: {
      description:
        'Sends a finalized invoice. Enforced: valid email format, currency must be one of USD/EUR/GBP/MXN, amount has at most 2 decimal places, and ccEmail is required whenever sendCopy is true.',
      example:
        "- group: invoicing\n  name: sendInvoice\n  params:\n    invoiceId: '{{ draft.id }}'\n    customerEmail: '{{ customer.email }}'\n    amount: 149.99\n    currency: 'USD'\n    sendCopy: true\n    ccEmail: 'billing@company.com'",
    },
  },
};
