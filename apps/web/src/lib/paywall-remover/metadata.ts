type Entry = Record<string, unknown>

function collect(parsed: unknown, out: Entry[]): void {
  for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
    if (!entry || typeof entry !== 'object') continue
    out.push(entry as Entry)
    const graph = (entry as { '@graph'?: unknown })['@graph']
    if (Array.isArray(graph)) collect(graph, out)
  }
}

export function readJsonLd(doc: Document): Entry[] {
  const out: Entry[] = []
  for (const node of doc.querySelectorAll(
    'script[type="application/ld+json"]'
  )) {
    try {
      collect(JSON.parse(node.textContent ?? ''), out)
    } catch {
      // A malformed block is not a reason to fail the whole page.
    }
  }
  return out
}

function meta(doc: Document, selectors: string[]): string | null {
  for (const selector of selectors) {
    const value = doc.querySelector(selector)?.getAttribute('content')?.trim()
    if (value) return value
  }
  return null
}

// schema.org lets a person be a string, an object with a name, or a list of
// either. All three appear in the wild on the same field.
function personName(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null

  if (Array.isArray(value)) {
    const names = value.map(personName).filter((name) => name !== null)
    return names.length > 0 ? names.join(', ') : null
  }

  if (value && typeof value === 'object') {
    const name = (value as Entry).name
    return typeof name === 'string' ? name.trim() || null : null
  }

  return null
}

export type Metadata = {
  title: string | null
  author: string | null
  publishedAt: string | null
  siteName: string | null
}

export function readMetadata(doc: Document): Metadata {
  const entries = readJsonLd(doc)

  const declared = (key: string): unknown => {
    for (const entry of entries)
      if (entry[key] !== undefined && entry[key] !== null) return entry[key]
    return undefined
  }

  const datePublished = declared('datePublished')

  return {
    title:
      meta(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ??
      personName(declared('headline')) ??
      doc.querySelector('title')?.textContent?.trim() ??
      null,

    author:
      personName(declared('author')) ??
      meta(doc, ['meta[name="author"]', 'meta[property="article:author"]']),

    publishedAt:
      (typeof datePublished === 'string' ? datePublished.trim() : null) ||
      meta(doc, [
        'meta[property="article:published_time"]',
        'meta[name="date"]'
      ]),

    siteName:
      meta(doc, ['meta[property="og:site_name"]']) ??
      personName(declared('publisher'))
  }
}
