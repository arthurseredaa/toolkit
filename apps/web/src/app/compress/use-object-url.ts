import { useEffect, useState } from 'react'

/**
 * The URL is created inside the effect, not in a memo. StrictMode mounts, runs
 * the cleanup, then mounts again — a memoized URL survives that (same deps, no
 * recompute) but its blob does not, leaving a live `src` pointing at a revoked
 * object. Creating it per setup means every mount gets a URL it owns.
 */
export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    if (!blob) {
      setUrl(undefined)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])

  return url
}
