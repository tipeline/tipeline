import { defineConfig } from 'vitepress';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  title: 'Tipeline',
  description: 'Workflow Automation & Orchestration Platform',
  cleanUrls: true,
  appearance: true,

  vite: {
    publicDir: path.resolve(__dirname, '../../../assets'),
  },

  markdown: {
    config: (md) => {
      const defaultCodeInline = md.renderer.rules.code_inline;
      md.renderer.rules.code_inline = (tokens, idx, options, env, self) => {
        const rendered = defaultCodeInline
          ? defaultCodeInline(tokens, idx, options, env, self)
          : self.renderToken(tokens, idx, options);
        return rendered
          .replace(/\{\{/g, '&#123;&#123;')
          .replace(/\}\}/g, '&#125;&#125;')
          .replace(/\{=/g, '&#123;=')
          .replace(/=\}/g, '=&#125;');
      };
    },
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo-light.svg' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    [
      'link',
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap',
      },
    ],
  ],

  themeConfig: {
    logo: { light: '/logo-dark.svg', dark: '/logo-light.svg' },
    siteTitle: false,

    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Workflows', link: '/workflows/files' },
      { text: 'Actions', link: '/actions/' },
      { text: 'Apps', link: '/apps/' },
      {
        text: 'Tools',
        items: [
          { text: 'Desktop', link: '/desktop/overview' },
          { text: 'Assistant', link: '/assistant/' },
          { text: 'CLI', link: '/cli/commands' },
          { text: 'Hub & Plugins', link: '/hub/' },
        ],
      },
      { text: 'Server', link: '/server/' },
      { text: 'Internals', link: '/internals/overview' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/introduction' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
            { text: 'Connect Other Tools', link: '/guide/connect-other-tools' },
          ],
        },
      ],
      '/workflows/': [
        {
          text: 'Workflows',
          items: [
            { text: 'Workflow Files (YAML)', link: '/workflows/files' },
            { text: 'Variables & Templates', link: '/workflows/variables' },
            { text: 'Conditions', link: '/workflows/conditions' },
            { text: 'Approvals', link: '/workflows/approvals' },
            { text: 'Caching Results', link: '/workflows/caching' },
            { text: 'What a Workflow Can Access', link: '/workflows/capabilities' },
          ],
        },
      ],
      '/actions/': [
        {
          text: 'Actions',
          items: [{ text: 'Overview', link: '/actions/' }],
        },
        {
          text: 'Automation',
          items: [
            { text: 'Browser', link: '/actions/browser' },
            { text: 'HTTP', link: '/actions/http' },
            { text: 'SSH', link: '/actions/ssh' },
            { text: 'Script', link: '/actions/script' },
            { text: 'Sub-workflow', link: '/actions/subtask' },
          ],
        },
        {
          text: 'Data',
          items: [
            { text: 'String', link: '/actions/string' },
            { text: 'Array', link: '/actions/array' },
            { text: 'Object', link: '/actions/object' },
            { text: 'Math', link: '/actions/math' },
            { text: 'DateTime', link: '/actions/datetime' },
            { text: 'Spreadsheet', link: '/actions/spreadsheet' },
            { text: 'HTML', link: '/actions/html' },
            { text: 'Variable', link: '/actions/variable' },
            { text: 'XML', link: '/actions/xml' },
          ],
        },
        {
          text: 'File & Media',
          items: [
            { text: 'File', link: '/actions/file' },
            { text: 'Folder', link: '/actions/folder' },
            { text: 'Image', link: '/actions/image' },
            { text: 'Audio', link: '/actions/audio' },
            { text: 'Video', link: '/actions/video' },
            { text: 'PDF', link: '/actions/pdf' },
            { text: 'Compression', link: '/actions/compression' },
            { text: 'OCR', link: '/actions/ocr' },
            { text: 'QR Code', link: '/actions/qrcode' },
          ],
        },
        {
          text: 'Integrations',
          items: [
            { text: 'AI', link: '/actions/ai' },
            { text: 'Email', link: '/actions/email' },
            { text: 'Database', link: '/actions/database' },
            { text: 'Network', link: '/actions/network' },
            { text: 'Cryptography', link: '/actions/cryptography' },
          ],
        },
        {
          text: 'Flow Control',
          items: [
            { text: 'Flow', link: '/actions/flow' },
            { text: 'Approval', link: '/actions/approval' },
            { text: 'System', link: '/actions/system' },
            { text: 'API', link: '/actions/api' },
          ],
        },
      ],
      '/apps/': [
        {
          text: 'Apps',
          items: [
            { text: 'Building Apps', link: '/apps/' },
            { text: 'Embedding Pages & HTML', link: '/apps/embed' },
            { text: 'Custom Components', link: '/apps/custom' },
          ],
        },
      ],
      '/desktop/': [
        {
          text: 'Desktop App',
          items: [
            { text: 'Overview', link: '/desktop/overview' },
            { text: 'Workflow Builder', link: '/desktop/builder' },
            { text: 'Runs', link: '/desktop/pipelines' },
            { text: 'Projects', link: '/desktop/projects' },
            { text: 'Project Map', link: '/desktop/project-map' },
            { text: 'Schedules', link: '/desktop/schedules' },
            { text: 'Global Variables', link: '/desktop/variables' },
            { text: 'Settings & Workspaces', link: '/desktop/settings' },
            { text: 'Backup & Restore', link: '/desktop/backup' },
            { text: 'Trash', link: '/desktop/trash' },
          ],
        },
      ],
      '/assistant/': [
        {
          text: 'Assistant & AI',
          items: [
            { text: 'Using the Assistant', link: '/assistant/' },
            { text: 'Workflows It Can Find', link: '/assistant/findable-workflows' },
            { text: 'Instructions', link: '/assistant/instructions' },
            { text: 'In the Terminal', link: '/assistant/cli' },
            { text: 'Connect AI Tools (MCP)', link: '/assistant/mcp' },
          ],
        },
      ],
      '/cli/': [
        {
          text: 'CLI Reference',
          items: [{ text: 'Commands', link: '/cli/commands' }],
        },
      ],
      '/hub/': [
        {
          text: 'Hub & Plugins',
          items: [
            { text: 'Hubs', link: '/hub/' },
            { text: 'Publishing to a Hub', link: '/hub/publishing' },
            { text: 'Plugins', link: '/hub/plugins' },
          ],
        },
      ],
      '/server/': [
        {
          text: 'Tipeline Server',
          items: [
            { text: 'Overview', link: '/server/' },
            { text: 'Docker Setup', link: '/server/docker' },
            { text: 'Bare-Metal Setup', link: '/server/bare-metal' },
            { text: 'API Reference', link: '/server/api' },
          ],
        },
      ],
      '/internals/': [
        {
          text: 'Contributing',
          items: [{ text: 'Developer Setup', link: '/internals/setup' }],
        },
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/internals/overview' },
            { text: 'Core Engine', link: '/internals/core-engine' },
            { text: 'Pipeline System', link: '/internals/pipeline' },
            { text: 'Variable System', link: '/internals/variable-system' },
            { text: 'Execution Flow', link: '/internals/execution-flow' },
            { text: 'Job Runners', link: '/internals/job-runners' },
            { text: 'Database Schema', link: '/internals/database' },
          ],
        },
        {
          text: 'Core APIs',
          items: [
            { text: 'IPC Protocol', link: '/internals/ipc' },
            { text: 'WebSocket API', link: '/internals/websocket' },
            { text: 'Core Engine API', link: '/internals/core-api' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/tipeline/tipeline' }],

    footer: {
      message: 'Released under the Apache License 2.0.',
      copyright: 'Copyright © 2022-2026 José Daniel Estrada Guzmán',
    },

    search: {
      provider: 'local',
    },
  },
});
