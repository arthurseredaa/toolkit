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

/**
 * Two entries with one name make an archive that unzips to a single file, so
 * the counter has to skip names the batch already carries — `a.jpg` next to a
 * real `a (2).jpg` numbers up to `a (3).jpg`, not into the collision.
 */
export function uniqueNames(names: string[]): string[] {
  const taken = new Set<string>()
  return names.map((name) => {
    if (!taken.has(name)) {
      taken.add(name)
      return name
    }
    const dot = name.lastIndexOf('.')
    const stem = dot <= 0 ? name : name.slice(0, dot)
    const ext = dot <= 0 ? '' : name.slice(dot)
    let n = 2
    while (taken.has(`${stem} (${n})${ext}`)) n++
    const unique = `${stem} (${n})${ext}`
    taken.add(unique)
    return unique
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
