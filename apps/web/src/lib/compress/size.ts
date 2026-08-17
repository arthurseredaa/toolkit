export function pickSmaller<T extends Blob>(
  original: T,
  candidate: T
): { blob: T; kept: boolean } {
  if (candidate.size < original.size) return { blob: candidate, kept: false }
  return { blob: original, kept: true }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export function savingsPercent(before: number, after: number): number {
  if (before <= 0 || after >= before) return 0
  return Math.round(((before - after) / before) * 100)
}
