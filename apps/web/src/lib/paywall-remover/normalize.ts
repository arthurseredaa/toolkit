const TRACKING =
  /^(utm_|fbclid$|gclid$|msclkid$|mc_(cid|eid)$|igshid$|ref_src$|ref_url$)/

export function normalizeUrl(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null

  url.hash = ''
  url.username = ''
  url.password = ''

  for (const key of Array.from(url.searchParams.keys()))
    if (TRACKING.test(key)) url.searchParams.delete(key)
  url.searchParams.sort()

  if (url.pathname.length > 1 && url.pathname.endsWith('/'))
    url.pathname = url.pathname.slice(0, -1)

  return url.toString()
}

export function canonicalKey(doc: Document, pageUrl: string): string {
  const declared =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ??
    doc.querySelector('meta[property="og:url"]')?.getAttribute('content')

  if (declared) {
    try {
      const normalized = normalizeUrl(new URL(declared, pageUrl).toString())
      if (normalized) return normalized
    } catch {
      // A malformed canonical is not a reason to reject the page.
    }
  }

  return normalizeUrl(pageUrl) ?? pageUrl
}
