import { downloadZip } from 'client-zip'

import type { CompressResult } from './types'

export function toFiles(results: CompressResult[]): File[] {
  return results.map((r) => new File([r.blob], r.name, { type: r.type }))
}

export function canShareFiles(files: File[]): boolean {
  return (
    files.length > 0 &&
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files })
  )
}

/**
 * Must be called synchronously inside the click handler — an `await` before
 * `navigator.share` throws NotAllowedError. A dismissed sheet is not an error.
 */
export function shareFiles(files: File[]): Promise<void> {
  return navigator.share({ files }).catch((e: unknown) => {
    if (e instanceof DOMException && e.name === 'AbortError') return
    throw e
  })
}

export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1
    seen.set(name, count)
    if (count === 1) return name
    const dot = name.lastIndexOf('.')
    return dot <= 0
      ? `${name} (${count})`
      : `${name.slice(0, dot)} (${count})${name.slice(dot)}`
  })
}

export function zipName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `photos-${day}.zip`
}

export function zipResults(results: CompressResult[]): Promise<Blob> {
  const names = uniqueNames(results.map((r) => r.name))
  const files = results.map(
    (r, i) => new File([r.blob], names[i], { type: r.type })
  )
  return downloadZip(files).blob()
}
