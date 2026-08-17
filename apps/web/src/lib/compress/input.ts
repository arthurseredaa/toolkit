const HEIC_RE = /\.hei[cf]$/i

/**
 * The only types `planOutput` and the encoder actually know. Anything else —
 * GIF, AVIF, SVG, BMP — would silently come out as a single JPEG frame.
 */
export const SUPPORTED = ['image/jpeg', 'image/png', 'image/webp']

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
  // Safari keeps the wildcard so the iOS picker offers HEIC and transcodes it.
  return isSafari ? 'image/*' : SUPPORTED.join(',')
}

/**
 * `accept` constrains the picker but not a drop, so this is where the format
 * list is enforced. HEIC is counted apart because it has its own way out.
 */
export function filterFiles(
  files: Iterable<File>,
  { isSafari }: { isSafari: boolean }
): { accepted: File[]; skippedHeic: number; skippedUnsupported: number } {
  const accepted: File[] = []
  let skippedHeic = 0
  let skippedUnsupported = 0
  for (const file of files) {
    if (isHeic(file)) {
      if (isSafari) accepted.push(file)
      else skippedHeic++
      continue
    }
    if (SUPPORTED.includes(file.type)) accepted.push(file)
    else skippedUnsupported++
  }
  return { accepted, skippedHeic, skippedUnsupported }
}
