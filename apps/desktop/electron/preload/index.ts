import { ipcRenderer, contextBridge, webUtils } from 'electron'
import { SEND } from '../../src/ipc-channels'

// Channels invoked/sent by the renderer via ipcRenderer.invoke()/send().
// Keep in sync with electron/main — anything not registered there is
// rejected here rather than forwarded blind.
const INVOKE_CHANNELS = new Set<string>([
  ...Object.values(SEND),
  'dialog:open-file',
  'dialog:save-file',
  'shell:show-item-in-folder',
  'app:open-url',
  'app:open-file',
  'app:fetch-url',
  'app:read-file',
  'app:media-check',
  'app:file-trust:get',
  'app:file-trust:set',
  'app:system-info',
])

// Channels the main process pushes to the renderer via webContents.send().
// `stream:<correlationId>` and `agent:<correlationId>` are dynamic (one per
// task/pipeline execution or agent run), so they're matched by prefix rather
// than listed individually.
const LISTEN_CHANNELS = new Set<string>([
  'core:disconnected',
  'core:reconnected',
  'app-update:ready',
  'stream:broadcast',
  'workspace-changed',
  'workspace-unavailable',
])

function isAllowedListenChannel(channel: string): boolean {
  return LISTEN_CHANNELS.has(channel) || channel.startsWith('stream:') || channel.startsWith('agent:')
}

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    if (!isAllowedListenChannel(channel)) {
      throw new Error(`[preload] Blocked ipcRenderer.on for unknown channel: ${channel}`)
    }
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    if (!isAllowedListenChannel(channel)) return
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    if (!INVOKE_CHANNELS.has(channel)) {
      throw new Error(`[preload] Blocked ipcRenderer.send for unknown channel: ${channel}`)
    }
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    if (!INVOKE_CHANNELS.has(channel)) {
      throw new Error(`[preload] Blocked ipcRenderer.invoke for unknown channel: ${channel}`)
    }
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

// The path on disk of a File the user dropped or picked (an app's file dropzone hands
// paths to workflows). Electron dropped File.path; webUtils is only reachable here.
// Each path is also reported to the main process as picked by the user, so an app may
// show or open that file even outside ~/Tipeline — only a real File (a drop or a file
// dialog) has a path, so a page can't make one up.
contextBridge.exposeInMainWorld('tipelineFiles', {
  pathFor(file: File): string {
    const filePath = webUtils.getPathForFile(file)
    if (filePath) ipcRenderer.send('app:file-picked', filePath)
    return filePath
  },
})

// --------- Preload scripts loading ---------
function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise((resolve) => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      return parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      return parent.removeChild(child)
    }
  },
}

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function useLoading() {
  const className = `loaders-css__square-spin`
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'app-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'app-loading-wrap'
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    },
  }
}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)
