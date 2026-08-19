// Article ids are canonical URLs. base64url keeps them to one path segment.
export function encodeId(id: string): string {
  const bytes = new TextEncoder().encode(id)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeId(slug: string): string | null {
  try {
    const base = slug.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base + '='.repeat((4 - (base.length % 4)) % 4)
    const binary = atob(padded)
    return new TextDecoder().decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0))
    )
  } catch {
    return null
  }
}
