/**
 * Greeting plugin — simple demo plugin for Tipeline's plugin system.
 *
 * Install: this folder already lives at ~/Tipeline/plugins/greeting.
 * The core engine loads it automatically on startup (or via a hot-reload
 * call to PluginLoader.reloadSingle for this path).
 *
 * Usage in a task YAML:
 *   - group: greeting
 *     name: sayHello
 *     params:
 *       name: '{{ userName }}'
 *
 *   - group: greeting
 *     name: sayGoodbye
 *     params:
 *       name: '{{ userName }}'
 *       formal: true
 */
export default {
  group: 'greeting',
  name: 'Greeting Plugin',
  description: 'Builds simple greeting and farewell messages.',
  author: 'Tipeline',
  version: '1.0.0',

  actions: {
    async sayHello(params) {
      const name = params?.name?.trim();
      if (!name) throw new Error('greeting.sayHello: "name" param is required');
      return `Hello, ${name}!`;
    },

    async sayGoodbye(params) {
      const name = params?.name?.trim();
      if (!name) throw new Error('greeting.sayGoodbye: "name" param is required');
      return params?.formal ? `Farewell, ${name}.` : `Goodbye, ${name}!`;
    },
  },

  params: {
    sayHello: [
      { name: 'name', type: 'string', label: 'Name', required: true },
    ],
    sayGoodbye: [
      { name: 'name', type: 'string', label: 'Name', required: true },
      { name: 'formal', type: 'boolean', label: 'Formal', default: false },
    ],
  },
};
