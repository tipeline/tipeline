import type { AppFormField } from '@tipeline/schemas';

export interface WorkflowVariable {
  name: string;
  type?: string;
  label?: string;
  description?: string;
  value?: unknown;
  required?: boolean;
  visibility?: string;
  output?: boolean;
  secret?: boolean;
  valueFromEnv?: string;
  valueFromGlobal?: string;
}

// Variables of these types hold live handles (browsers, connections, media) that a
// form can't produce.
const NOT_FORM_INPUT = new Set([
  'browser',
  'sshConnection',
  'dbConnection',
  'workbook',
  'oauthToken',
  'image',
  'audio',
  'video',
]);

const humanize = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

/** Whether an app form can set this workflow variable. */
export function isFormInput(v: WorkflowVariable): boolean {
  return (
    (v.visibility ?? 'private') !== 'private' &&
    !v.output &&
    !NOT_FORM_INPUT.has(v.type ?? 'string') &&
    !v.valueFromEnv &&
    !v.valueFromGlobal
  );
}

/**
 * Form fields for a workflow's settable variables (public/protected, not outputs, not
 * live-handle types, not sourced from env/globals). Strings named like paths get a file picker,
 * like emails an email field, like phones a phone field; secret ones a password
 * field (never with their stored value); arrays/objects are edited as JSON.
 */
export function fieldsFromVariables(
  variables: WorkflowVariable[]
): AppFormField[] {
  return variables.filter(isFormInput).map((v) => {
    const type = v.type ?? 'string';
    const fieldType: AppFormField['type'] =
      type === 'number'
        ? 'number'
        : type === 'boolean'
          ? 'checkbox'
          : type === 'date'
            ? 'date'
            : type === 'array' || type === 'object'
              ? 'textarea'
              : v.secret
                ? 'password'
                : /(path|file)$/i.test(v.name)
                  ? 'file'
                  : /e-?mail/i.test(v.name)
                    ? 'email'
                    : /(phone|tel|mobile)$/i.test(v.name)
                      ? 'phone'
                      : 'text';

    const field: AppFormField = {
      name: v.name,
      type: fieldType,
      label: v.label || humanize(v.name),
    };
    if (v.description) field.description = v.description;
    if (v.required) field.required = true;
    // A secret's stored value is never put into an app as a default.
    if (!v.secret && v.value !== undefined && v.value !== null && v.value !== '') {
      field.default =
        fieldType === 'textarea' && typeof v.value !== 'string'
          ? JSON.stringify(v.value)
          : fieldType === 'date' && typeof v.value === 'string'
            ? v.value.slice(0, 10)
            : v.value;
    }
    return field;
  });
}
