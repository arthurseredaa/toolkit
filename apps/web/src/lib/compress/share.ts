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
