/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
  /** The path on disk of a dropped / picked File ("" when it has none). */
  tipelineFiles?: { pathFor(file: File): string }
}
