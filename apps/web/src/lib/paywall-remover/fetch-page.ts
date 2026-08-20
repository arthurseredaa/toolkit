import { assertPublicUrl } from './ssrf'

const MAX_BYTES = 5 * 1024 * 1024
const MAX_REDIRECTS = 3

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

const CHALLENGE_MARKERS = [
  'cf_chl_opt',
  '__cf_chl_',
  'cf-browser-verification',
  'Just a moment...',
  'Checking your browser before accessing',
  'Attention Required! | Cloudflare'
]

export type PageFetch = { html: string; finalUrl: string }

export function isChallengePage(html: string): boolean {
  return CHALLENGE_MARKERS.some((marker) => html.includes(marker))
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return response.text()

  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    total += value.length
    if (total >= MAX_BYTES) {
      await reader.cancel()
      break
    }
  }

  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return new TextDecoder().decode(merged)
}

export async function fetchPage(
  input: string,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<PageFetch> {
  const { signal, timeoutMs = 6000 } = options
  let current = input

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current)
    const timeout = AbortSignal.timeout(timeoutMs)

    const response = await fetch(url, {
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: {
        'user-agent': UA,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9'
      }
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('blocked')
      current = new URL(location, url).toString()
      continue
    }

    if (!response.ok) throw new Error('blocked')

    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('html')) throw new Error('blocked')

    return { html: await readCapped(response), finalUrl: url.toString() }
  }

  throw new Error('blocked')
}
