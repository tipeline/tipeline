/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

// Desktop's source, used as is by the Apps pages (resolved in vite.config.ts). It isn't
// type-checked from here: Desktop checks its own.
declare module '@desktop/*' {
  const value: any;
  export = value;
}
