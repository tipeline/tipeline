import path from 'node:path'
import fs from 'node:fs'

// What an app's openUrl / openFile actions may do. Apps come from anyone (the hub,
// a colleague), so opening is the risky part: `shell.openPath` on a program runs it.
// - openUrl: only web and mail links (the same ones app Markdown renders as links).
// - openFile "open": only files inside ~/Tipeline, and never programs or scripts.
// - "reveal" (show in folder) and "save" (copy to where the user picks) run nothing,
//   so any existing file may be revealed or saved.
// Pure functions (no Electron), so they're testable; index.ts does the opening.

export type OpenFileMode = 'open' | 'reveal' | 'save'

export type OpenRefusal = 'badUrl' | 'notFound' | 'outsideTipeline' | 'program' | 'notAFile'

export function checkOpenUrl(url: unknown): OpenRefusal | null {
  return typeof url === 'string' && /^(https?:\/\/|mailto:)\S+$/i.test(url.trim()) ? null : 'badUrl'
}

// Extensions that run something when opened (macOS, Windows, Linux).
const PROGRAMS = new Set([
  'app', 'command', 'tool', 'sh', 'bash', 'zsh', 'csh', 'fish', 'pkg', 'mpkg', 'dmg', 'scpt',
  'scptd', 'applescript', 'workflow', 'action', 'terminal', 'webloc', 'inetloc', 'jar', 'py',
  'rb', 'pl', 'php', 'js', 'mjs', 'cjs', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1', 'exe', 'msi',
  'msp', 'bat', 'cmd', 'com', 'scr', 'cpl', 'lnk', 'url', 'reg', 'hta', 'gadget', 'appimage',
  'deb', 'rpm', 'run', 'bin', 'desktop', 'service', 'plist', 'kext', 'prefpane', 'osax',
])

export function isProgram(file: string): boolean {
  const ext = path.extname(file).slice(1).toLowerCase()
  return PROGRAMS.has(ext)
}

/** `~/…` and paths relative to ~/Tipeline, made absolute. */
export function resolveAppPath(file: string, home: string): string {
  const trimmed = file.trim()
  if (trimmed === '~' || trimmed.startsWith('~/')) return path.join(home, trimmed.slice(1))
  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(home, 'Tipeline', trimmed)
}

/**
 * Whether `file` may be opened this way. Pass the *real* path (links followed), so a
 * link in ~/Tipeline can't point at a program elsewhere. `stat` says what is there
 * (null when nothing). A folder only for "reveal"; `.app` bundles are folders and
 * programs.
 */
export function checkOpenFile(
  file: string,
  mode: OpenFileMode,
  home: string,
  stat: (p: string) => { isFile: boolean; isDirectory: boolean; executable?: boolean } | null,
  /** The app may use files anywhere (trusted), or the user picked this one. */
  anywhere = false
): OpenRefusal | null {
  const info = stat(file)
  if (!info) return 'notFound'
  if (mode === 'reveal') return null
  if (mode === 'open') {
    // Programs first: "it's a program" says more than "it's outside ~/Tipeline".
    // An executable without an extension (a script) runs in Terminal when opened.
    if (isProgram(file) || info.executable) return 'program'
    const root = path.join(home, 'Tipeline') + path.sep
    if (!anywhere && !file.startsWith(root)) return 'outsideTipeline'
  }
  return info.isFile ? null : 'notAFile'
}

/**
 * The real path of a file an app may read (an Image or PDF viewer's file): a file,
 * at most `maxBytes`, and inside ~/Tipeline — unless `anywhere(realPath)` says this
 * one may come from anywhere (a trusted app, or a file the user picked). Links are
 * followed first, so one inside ~/Tipeline can't point outside. `~/…` and paths
 * relative to ~/Tipeline are allowed.
 */
export function readableAppFile(
  raw: unknown,
  home: string,
  maxBytes: number,
  anywhere: (realPath: string) => boolean = () => false
): { ok: true; file: string } | { ok: false; error: 'notFound' | 'tooLarge' | 'outsideTipeline' } {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'notFound' }
  let file: string
  try {
    file = fs.realpathSync(resolveAppPath(raw, home))
  } catch {
    return { ok: false, error: 'notFound' }
  }
  // The root itself may be a link (e.g. ~/Tipeline on another disk): compare real paths.
  let realRoot = path.join(home, 'Tipeline')
  try {
    realRoot = fs.realpathSync(realRoot)
  } catch {
    // no ~/Tipeline: nothing is inside it
  }
  if (!file.startsWith(realRoot + path.sep) && !anywhere(file)) return { ok: false, error: 'outsideTipeline' }
  const stat = fs.statSync(file)
  if (!stat.isFile()) return { ok: false, error: 'notFound' }
  if (stat.size > maxBytes) return { ok: false, error: 'tooLarge' }
  return { ok: true, file }
}
