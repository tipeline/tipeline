import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// Which apps may use files anywhere on this computer (not only inside ~/Tipeline),
// and which files the user picked themselves this session. Both live here, in the
// main process of this computer: an app's definition (its YAML, its actions) can't
// reach them — only Tipeline's own screens set trust (the app's Edit dialog, and
// creating an app), and only a real drop / file pick records a picked file (preload).

const storeFile = () => path.join(app.getPath('userData'), 'app-file-trust.json')
let trusted: Set<string> | null = null

function load(): Set<string> {
  if (trusted) return trusted
  try {
    const data = JSON.parse(fs.readFileSync(storeFile(), 'utf8'))
    trusted = new Set(Array.isArray(data?.trusted) ? data.trusted.filter((id: unknown) => typeof id === 'string') : [])
  } catch {
    trusted = new Set()
  }
  return trusted
}

export function isAppTrusted(appIdentifier: unknown): boolean {
  return typeof appIdentifier === 'string' && load().has(appIdentifier)
}

export function setAppTrusted(appIdentifier: unknown, value: boolean): void {
  if (typeof appIdentifier !== 'string' || !appIdentifier) return
  const set = load()
  if (value) set.add(appIdentifier)
  else set.delete(appIdentifier)
  fs.mkdirSync(path.dirname(storeFile()), { recursive: true })
  fs.writeFileSync(storeFile(), JSON.stringify({ trusted: [...set].sort() }, null, 2))
}

// Real paths of files the user dropped or picked (until the app quits).
const picked = new Set<string>()

export function recordPickedFile(file: unknown): void {
  if (typeof file !== 'string' || !file) return
  try {
    picked.add(fs.realpathSync(file))
  } catch {
    // gone already: nothing to allow
  }
}

export function wasPicked(realPath: string): boolean {
  return picked.has(realPath)
}
