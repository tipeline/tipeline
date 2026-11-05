import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { readableAppFile } from './appOpen'

// Video and audio files for an app's Media component, streamed (with seeking) by the
// `tipeline-media://` protocol: tipeline-media://play?path=<path>&app=<app id>.
// Same rule as an Image or PDF file — inside ~/Tipeline, or anywhere for an app the
// user trusts or a file they picked — but no size limit (it streams), and only media
// files: the protocol can't be used to read anything else.

export const MEDIA_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
}

export const mediaType = (file: string): string | null =>
  MEDIA_TYPES[path.extname(file).slice(1).toLowerCase()] ?? null

export type MediaRefusal = 'notFound' | 'outsideTipeline' | 'notMedia'

/** The real path of a media file an app may play, or why not. */
export function playableMediaFile(
  raw: unknown,
  home: string,
  anywhere: (realPath: string) => boolean
): { ok: true; file: string; type: string } | { ok: false; error: MediaRefusal } {
  const found = readableAppFile(raw, home, Number.POSITIVE_INFINITY, anywhere)
  if (!found.ok) return { ok: false, error: found.error === 'tooLarge' ? 'notFound' : found.error }
  const type = mediaType(found.file)
  if (!type) return { ok: false, error: 'notMedia' }
  return { ok: true, file: found.file, type }
}

/** A `Range: bytes=…` header as [start, end] (inclusive) inside `size`, or null for the whole file. */
export function byteRange(header: string | null, size: number): [number, number] | null | 'invalid' {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2])) return 'invalid'
  let start: number
  let end: number
  if (!match[1]) {
    // the last N bytes
    start = Math.max(0, size - Number(match[2]))
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  }
  if (start > end || start >= size) return 'invalid'
  return [start, end]
}

/** The protocol's answer for one request: the file, or the part of it the player asked for. */
export function mediaResponse(
  requestUrl: string,
  rangeHeader: string | null,
  home: string,
  anywhere: (appIdentifier: string, realPath: string) => boolean
): Response {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return new Response(null, { status: 400 })
  }
  const app = url.searchParams.get('app') ?? ''
  const found = playableMediaFile(url.searchParams.get('path'), home, (real) => anywhere(app, real))
  if (!found.ok) return new Response(null, { status: found.error === 'notFound' ? 404 : 403 })
  const size = fs.statSync(found.file).size
  const range = byteRange(rangeHeader, size)
  if (range === 'invalid') {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  const [start, end] = range ?? [0, size - 1]
  const body = size === 0 ? null : (Readable.toWeb(fs.createReadStream(found.file, { start, end })) as ReadableStream)
  return new Response(body, {
    status: range ? 206 : 200,
    headers: {
      'Content-Type': found.type,
      'Content-Length': String(size === 0 ? 0 : end - start + 1),
      'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    },
  })
}
