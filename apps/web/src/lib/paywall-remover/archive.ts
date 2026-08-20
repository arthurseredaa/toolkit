export type Snapshot = { url: string; timestamp: string }

type Availability = {
  archived_snapshots?: {
    closest?: { available?: boolean; url?: string; timestamp?: string }
  }
}

// `id_` asks Wayback for the original bytes, without its own toolbar injected.
export function rawSnapshotUrl(url: string): string {
  return url.replace(/\/web\/(\d+)\//, '/web/$1id_/')
}

// archive.today often holds a fuller copy than Wayback, but answers automated
// clients with 429 + reCAPTCHA on every mirror. This is a link for the reader
// to follow in their own browser — never fetch it from the server.
export function archiveTodayUrl(target: string): string {
  return `https://archive.is/newest/${target}`
}

export function snapshotDate(timestamp: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(timestamp)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export async function findSnapshot(
  target: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<Snapshot | null> {
  const { signal, timeoutMs = 6000 } = options

  const api = new URL('https://archive.org/wayback/available')
  api.searchParams.set('url', target)

  const timeout = AbortSignal.timeout(timeoutMs)
  const response = await fetch(api, {
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: { accept: 'application/json' }
  })

  if (!response.ok) return null

  const body = (await response.json()) as Availability
  const closest = body.archived_snapshots?.closest

  if (!closest?.available || !closest.url) return null

  return { url: closest.url, timestamp: closest.timestamp ?? '' }
}
