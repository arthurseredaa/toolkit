export type Completeness = 'complete' | 'suspicious' | 'paywalled'

const SUSPICIOUS_FLOOR = 1500

type Entry = Record<string, unknown>

function isFalseFlag(value: unknown): boolean {
  return value === false || value === 'False' || value === 'false'
}

function isTrueFlag(value: unknown): boolean {
  return value === true || value === 'True' || value === 'true'
}

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

export function readDeclaration(doc: Document): boolean | null {
  let declared: boolean | null = null

  for (const entry of readJsonLd(doc)) {
    if (isFalseFlag(entry.isAccessibleForFree)) return false
    if (isTrueFlag(entry.isAccessibleForFree)) declared ??= true

    const raw = entry.hasPart
    const parts = Array.isArray(raw) ? raw : raw ? [raw] : []

    for (const part of parts) {
      if (!part || typeof part !== 'object') continue
      const p = part as Entry
      if (!isFalseFlag(p.isAccessibleForFree)) continue
      if (typeof p.cssSelector !== 'string') continue
      try {
        if (doc.querySelector(p.cssSelector)) return false
      } catch {
        // An invalid selector tells us nothing; keep looking.
      }
    }
  }

  return declared
}

export function assess(
  declared: boolean | null,
  textLength: number
): Completeness {
  if (declared === false) return 'paywalled'
  if (declared === true) return 'complete'
  return textLength < SUSPICIOUS_FLOOR ? 'suspicious' : 'complete'
}
