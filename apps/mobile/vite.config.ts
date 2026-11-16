import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const mobileSrc = path.resolve(__dirname, 'src');
const desktopSrc = path.resolve(__dirname, '../desktop/src');

/**
 * Apps on the phone run Desktop's app runtime and widgets unchanged, straight from
 * apps/desktop/src (imported as `@desktop/...`). Inside those files `@/` means Desktop's
 * source, everywhere else the phone's; and Desktop's page grid (AppGrid) becomes the phone's
 * one-column grid (src/apps/PhoneGrid.vue). A list view's items keep Desktop's StaticGrid:
 * on a phone each item is a full-width card, so its own small layout still fits.
 */
function desktopSource(): Plugin {
  const phoneGrid = path.join(mobileSrc, 'apps/PhoneGrid.vue');
  return {
    name: 'tipeline-desktop-source',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const from = importer?.split('?')[0] ?? '';
      const inDesktop = from.startsWith(desktopSrc + path.sep);
      if (inDesktop && /(^|\/)AppGrid\.vue$/.test(source) && from.includes(`${path.sep}components${path.sep}app${path.sep}`)) {
        return phoneGrid;
      }
      let target: string | null = null;
      if (source.startsWith('@desktop/')) target = path.join(desktopSrc, source.slice('@desktop/'.length));
      else if (source.startsWith('@/')) target = path.join(inDesktop ? desktopSrc : mobileSrc, source.slice(2));
      if (!target) return null;
      return this.resolve(target, importer, { ...options, skipSelf: true });
    },
  };
}

// A fixed port: the Server only answers browsers from origins it lists, so
// TIPELINE_CORS_ORIGINS=http://localhost:5180 has to match this address.
export default defineConfig({
  plugins: [desktopSource(), vue(), tailwindcss()],
  resolve: {
    alias: {
      '@shared-assets': path.resolve(__dirname, '../../assets'),
    },
  },
  server: { port: 5180, strictPort: true, fs: { allow: [path.resolve(__dirname, '../..')] } },
  preview: { port: 5180, strictPort: true },
  test: {
    environment: 'happy-dom',
  },
});
