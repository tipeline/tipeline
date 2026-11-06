/**
 * Text Case plugin — converts strings between common case styles.
 *
 * Install: this folder already lives at ~/.tipeline/plugins/text-case.
 * The core engine loads it automatically on startup (or via a hot-reload
 * call to PluginLoader.reloadSingle for this path).
 *
 * Usage in a task YAML:
 *   - group: textcase
 *     name: toKebabCase
 *     params:
 *       text: '{{ productName }}'
 */

function words(text) {
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
}

function requireText(params, actionName) {
  const text = params?.text;
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error(`textcase.${actionName}: "text" param is required`);
  }
  return text;
}

export default {
  group: 'textcase',
  name: 'Text Case Plugin',
  description: 'Converts strings between kebab-case, snake_case, camelCase, and Title Case.',
  author: 'Tipeline',
  version: '1.0.0',

  actions: {
    async toKebabCase(params) {
      const text = requireText(params, 'toKebabCase');
      return words(text).join('-');
    },

    async toSnakeCase(params) {
      const text = requireText(params, 'toSnakeCase');
      return words(text).join('_');
    },

    async toCamelCase(params) {
      const text = requireText(params, 'toCamelCase');
      const [first, ...rest] = words(text);
      if (!first) return '';
      return first + rest.map((w) => w[0].toUpperCase() + w.slice(1)).join('');
    },

    async toTitleCase(params) {
      const text = requireText(params, 'toTitleCase');
      return words(text)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(' ');
    },
  },

  params: {
    toKebabCase: [{ name: 'text', type: 'string', label: 'Text', required: true }],
    toSnakeCase: [{ name: 'text', type: 'string', label: 'Text', required: true }],
    toCamelCase: [{ name: 'text', type: 'string', label: 'Text', required: true }],
    toTitleCase: [{ name: 'text', type: 'string', label: 'Text', required: true }],
  },
};
