import fs from 'node:fs'
import path from 'node:path'

// Core reads this file at the start of every run (`{{ _env.KEY }}`, `valueFromEnv`): see
// apps/core/src/utils/globalEnvFile.ts. Settings → Environment shows it, opens it, and
// keeps it readable by this account only. Values never leave the main process: the
// page gets the names only.

export interface EnvFileInfo {
  path: string
  exists: boolean
  /** The names the file sets, in file order. */
  names: string[]
  /** Other accounts on this computer can read it (never on Windows, where modes don't apply). */
  shared: boolean
}

const TEMPLATE = `# Tipeline environment file
#
# One NAME=value per line. A workflow reads a value with {{ _env.NAME }},
# or a variable takes it as its default with valueFromEnv: NAME.
# Changes apply to the next run, without restarting Tipeline.
#
# Values here are plain text. For passwords and API keys, a secret global
# variable is safer: Tipeline keeps those encrypted.
#
# API_KEY=your-key-here
`

export const envFilePath = (home: string): string => path.join(home, '.tipeline', '.env')

/** The names a .env file sets, the way dotenv reads them (`NAME=`, `export NAME=`). */
export function envFileNames(text: string): string[] {
  const names: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([\w.-]+)\s*[=:]/.exec(line)
    if (match && !names.includes(match[1])) names.push(match[1])
  }
  return names
}

const isShared = (mode: number, platform: NodeJS.Platform) => platform !== 'win32' && (mode & 0o077) !== 0

export function readEnvFileInfo(home: string, platform: NodeJS.Platform = process.platform): EnvFileInfo {
  const file = envFilePath(home)
  try {
    const stat = fs.statSync(file)
    return {
      path: file,
      exists: true,
      names: envFileNames(fs.readFileSync(file, 'utf8')),
      shared: isShared(stat.mode, platform),
    }
  } catch {
    return { path: file, exists: false, names: [], shared: false }
  }
}

/** Creates the file (with a short how-to, readable by this account only) when there's none yet. */
export function ensureEnvFile(home: string): string {
  const file = envFilePath(home)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  try {
    fs.writeFileSync(file, TEMPLATE, { mode: 0o600, flag: 'wx' })
  } catch (error: any) {
    if (error?.code !== 'EEXIST') throw error
  }
  return file
}

/** Takes away other accounts' access to an existing file. */
export function makeEnvFilePrivate(home: string, platform: NodeJS.Platform = process.platform): void {
  if (platform === 'win32') return
  fs.chmodSync(envFilePath(home), 0o600)
}
