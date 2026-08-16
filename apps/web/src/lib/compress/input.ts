const HEIC_RE = /\.hei[cf]$/i

export function isSafariUA(ua: string): boolean {
  return /Safari\//.test(ua) && !/Chrome|CriOS|Chromium|Edg|OPR|FxiOS/.test(ua)
}

export function isHeic(file: File): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    HEIC_RE.test(file.name)
  )
}

/** `accept` for the file input. A hint to the picker, not enforcement — see filterFiles. */
export function ACCEPT(isSafari: boolean): string {
  return isSafari ? 'image/*' : 'image/jpeg,image/png,image/webp'
}

export function filterFiles(
  files: Iterable<File>,
  { isSafari }: { isSafari: boolean }
): { accepted: File[]; skippedHeic: number } {
  const accepted: File[] = []
  let skippedHeic = 0
  for (const file of files) {
    if (isHeic(file)) {
      if (isSafari) accepted.push(file)
      else skippedHeic++
      continue
    }
    if (file.type.startsWith('image/')) accepted.push(file)
  }
  return { accepted, skippedHeic }
}
