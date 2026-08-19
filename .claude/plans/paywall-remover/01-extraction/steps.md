# Steps — extraction route

Decisions: ./plan.md

All files live under `apps/web/`. Paths below are relative to that directory.
`@mozilla/readability`, `linkedom` and `fake-indexeddb` are already installed —
no task installs anything.

Every test file that imports `linkedom` or exercises `fetch` must open with the
docblock `/** @vitest-environment node */`, because `vitest.config.mts` sets
jsdom globally.

Run after every task: `pnpm -F web test`, `pnpm -F web typecheck`, `pnpm lint`.
The pipeline commits each task itself — do not run git.

---

## Task 1 — Types and URL normalization

**Agent:** tdd -> worker

**Goal:** the shared type surface for the whole feature, plus a normalizer that
collapses tracking and casing variants of one URL into one key.

**Files:**
- `src/lib/paywall-remover/types.ts` (new)
- `src/lib/paywall-remover/normalize.ts` (new)
- `src/lib/paywall-remover/normalize.test.ts` (new)

**The test that proves it:** `normalize.test.ts` asserts that
`normalizeUrl` strips `utm_*`/`fbclid`/`gclid`, drops the fragment, lowercases
the host, removes a trailing slash on a non-root path, sorts the remaining query
params, and returns `null` for `javascript:`, `file:` and unparseable input.
`canonicalKey` prefers `link[rel=canonical]`, falls back to `meta[og:url]`,
resolves a relative canonical against the page URL, and falls back to the
normalized page URL when the page declares neither.

**Verify:** `pnpm -F web test src/lib/paywall-remover/normalize.test.ts`

```ts
// src/lib/paywall-remover/types.ts
export type BlockType = 'p' | 'h2' | 'h3' | 'li' | 'quote'

export type Block = { type: BlockType; text: string }

export type RouteName = 'publisher' | 'archive'

export type Article = {
  id: string
  url: string
  title: string
  author: string | null
  publishedAt: string | null
  siteName: string | null
  route: RouteName
  snapshotAt: string | null
  blocks: Block[]
  savedAt: number
}

export type FailureReason =
  | 'invalid-url'
  | 'blocked'
  | 'paywalled'
  | 'no-snapshot'
  | 'timeout'

export type ExtractResult =
  | { ok: true; article: Article }
  | { ok: false; reason: FailureReason; url: string }

export type RouteOutcome =
  | { ok: true; article: Article }
  | { ok: false; reason: FailureReason }
```

```ts
// src/lib/paywall-remover/normalize.ts
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

  for (const key of [...url.searchParams.keys()])
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
```

- [x] `types.ts` and `normalize.ts` exist, tests green

---

## Task 2 — SSRF address guard

**Agent:** tdd -> worker

**Goal:** refuse any URL that resolves to an address inside the deployment's
network before a single byte is fetched.

**Files:**
- `src/lib/paywall-remover/ssrf.ts` (new)
- `src/lib/paywall-remover/ssrf.test.ts` (new)

**The test that proves it:** `ssrf.test.ts` asserts `isBlockedAddress` returns
`true` for `127.0.0.1`, `10.1.2.3`, `192.168.0.1`, `172.16.0.1`, `169.254.169.254`
(the cloud metadata endpoint), `100.64.0.1` (CGNAT), `::1`, `fd00::1`,
`fe80::1`, and `::ffff:127.0.0.1`; and `false` for `93.184.216.34` and
`2606:2800:220:1::1`. `assertPublicUrl` rejects `file:///etc/passwd` and
`javascript:alert(1)`, and resolves a public hostname to a `URL`. DNS is stubbed
with `vi.mock('node:dns/promises')` so the test never touches the network.

**Verify:** `pnpm -F web test src/lib/paywall-remover/ssrf.test.ts`

```ts
// src/lib/paywall-remover/ssrf.ts
/** @see ./plan.md — SSRF trap */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
]

function toInt(ip: string): number {
  return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0) >>> 0
}

export function isBlockedAddress(address: string): boolean {
  const kind = isIP(address)

  if (kind === 6) {
    const v6 = address.toLowerCase()
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v6)
    if (mapped) return isBlockedAddress(mapped[1])
    if (v6 === '::1' || v6 === '::') return true
    return /^(fe[89ab]|fc|fd)/.test(v6)
  }

  if (kind !== 4) return true

  const value = toInt(address)
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = (bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0) >>> 0
    return ((value & mask) >>> 0) === ((toInt(base) & mask) >>> 0)
  })
}

export async function assertPublicUrl(input: string | URL): Promise<URL> {
  const url = input instanceof URL ? input : new URL(input)

  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('blocked')

  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true })

  if (addresses.length === 0) throw new Error('blocked')
  for (const { address } of addresses)
    if (isBlockedAddress(address)) throw new Error('blocked')

  return url
}
```

- [x] `ssrf.ts` exists, every listed address case asserted, tests green

---

## Task 3 — Capped, redirect-checked page fetch

**Agent:** tdd -> worker

**Goal:** fetch a page as an ordinary reader with every hop re-validated, the
body size capped, and a Cloudflare challenge recognised as `blocked` rather than
parsed as an article.

**Files:**
- `src/lib/paywall-remover/fetch-page.ts` (new)
- `src/lib/paywall-remover/fetch-page.test.ts` (new)

**The test that proves it:** with `globalThis.fetch` stubbed via `vi.stubGlobal`
and `assertPublicUrl` mocked to pass, `fetch-page.test.ts` asserts that a `302`
is followed and the new hop re-validated, that a fourth redirect throws, that a
`403` throws, that a `content-type: video/mp4` response throws, that a body
larger than the 5 MB cap is truncated rather than buffered whole, and that
`isChallengePage` returns `true` for a body containing `cf_chl_opt` and `false`
for ordinary article HTML.

**Verify:** `pnpm -F web test src/lib/paywall-remover/fetch-page.test.ts`

```ts
// src/lib/paywall-remover/fetch-page.ts
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
```

- [x] `fetch-page.ts` exists, redirect / status / content-type / cap / challenge cases asserted, tests green

---

## Task 4 — Paywall declaration and the three-state detector

**Agent:** tdd -> worker

**Goal:** read the publisher's own schema.org declaration, and fall back to a
length floor only where nothing was declared.

**Files:**
- `src/lib/paywall-remover/completeness.ts` (new)
- `src/lib/paywall-remover/completeness.test.ts` (new)

**The test that proves it:** `completeness.test.ts` (node environment, builds
documents with `parseHTML`) asserts `readDeclaration` returns `false` for
`isAccessibleForFree: false`, for the string `"False"`, and for a `hasPart`
entry that is `isAccessibleForFree: false` **and** whose `cssSelector` matches an
element present in the document; returns `true` for `isAccessibleForFree: true`;
returns `null` for a page with no JSON-LD, for malformed JSON-LD, and when the
`hasPart` `cssSelector` matches nothing. It also asserts `assess` maps
`(false, any) -> 'paywalled'`, `(true, 200) -> 'complete'`,
`(null, 400) -> 'suspicious'` and `(null, 4000) -> 'complete'`.

**Verify:** `pnpm -F web test src/lib/paywall-remover/completeness.test.ts`

```ts
// src/lib/paywall-remover/completeness.ts
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
```

- [x] `completeness.ts` exists, declaration and floor cases asserted, tests green

---

## Task 5 — Readability block extraction

**Agent:** tdd -> worker

**Goal:** turn a page of HTML into typed text blocks plus metadata, reading the
canonical key and the paywall declaration **before** Readability mutates the
document.

**Files:**
- `src/lib/paywall-remover/extract.ts` (new)
- `src/lib/paywall-remover/extract.test.ts` (new)

**The test that proves it:** `extract.test.ts` (node environment) feeds a small
article page to `parseArticle` and asserts the returned `blocks` are
`[{type:'p'},{type:'h2'},{type:'p'},{type:'li'},{type:'li'},{type:'quote'}]` in
document order with whitespace collapsed; that a `<p>` nested inside an `<li>`
does not produce a duplicate block; that `title`, `author`, `siteName` and
`publishedAt` come back populated; that `declared` is `false` when the page
carries `isAccessibleForFree: false`; and that `parseArticle` returns `null` for
a page with no article content.

**Verify:** `pnpm -F web test src/lib/paywall-remover/extract.test.ts`

```ts
// src/lib/paywall-remover/extract.ts
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'

import { readDeclaration } from './completeness'
import { canonicalKey } from './normalize'
import type { Block, BlockType } from './types'

// Swap this import for jsdom if a real site parses badly — both hand back a
// `document`. See ./plan.md, "jsdom escape hatch".

const BLOCK_SELECTOR = 'p, h2, h3, h4, li, blockquote'

const TYPE_BY_TAG: Record<string, BlockType> = {
  P: 'p',
  H2: 'h2',
  H3: 'h3',
  H4: 'h3',
  LI: 'li',
  BLOCKQUOTE: 'quote'
}

export type Parsed = {
  key: string
  title: string
  author: string | null
  publishedAt: string | null
  siteName: string | null
  declared: boolean | null
  blocks: Block[]
  length: number
}

export function toBlocks(root: Element): Block[] {
  const blocks: Block[] = []

  for (const el of root.querySelectorAll(BLOCK_SELECTOR)) {
    const type = TYPE_BY_TAG[el.tagName.toUpperCase()]
    if (!type) continue
    // `<li><p>…</p></li>` would otherwise emit the same text twice.
    if (type === 'p' && el.closest('li, blockquote')) continue

    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text.length === 0) continue

    blocks.push({ type, text })
  }

  return blocks
}

export function parseArticle(html: string, pageUrl: string): Parsed | null {
  const { document } = parseHTML(html)
  const doc = document as unknown as Document

  // Readability mutates the document, so read our own signals first.
  const key = canonicalKey(doc, pageUrl)
  const declared = readDeclaration(doc)

  const article = new Readability(doc, {
    serializer: (el: unknown) => el
  }).parse()

  if (!article?.content) return null

  const blocks = toBlocks(article.content as unknown as Element)
  if (blocks.length === 0) return null

  return {
    key,
    title: article.title?.trim() || pageUrl,
    author: article.byline?.trim() || null,
    publishedAt: article.publishedTime?.trim() || null,
    siteName: article.siteName?.trim() || null,
    declared,
    blocks,
    length: blocks.reduce((n, block) => n + block.text.length, 0)
  }
}
```

- [x] `extract.ts` exists, block order / nesting / metadata / declaration cases asserted, tests green

---

## Task 6 — Wayback snapshot lookup

**Agent:** tdd -> worker

**Goal:** ask the Wayback availability API for the closest snapshot and hand
back a raw snapshot URL with no Wayback toolbar in it.

**Files:**
- `src/lib/paywall-remover/archive.ts` (new)
- `src/lib/paywall-remover/archive.test.ts` (new)

**The test that proves it:** with `fetch` stubbed, `archive.test.ts` asserts
`findSnapshot` returns `{url, timestamp}` for a payload whose
`archived_snapshots.closest.available` is `true`; returns `null` when `closest`
is absent, when `available` is `false`, and when the API responds `503`.
`rawSnapshotUrl` rewrites `/web/20240101000000/` to `/web/20240101000000id_/`,
and `snapshotDate` turns `20240115123045` into `2024-01-15` and any
unrecognised timestamp into `null`.

**Verify:** `pnpm -F web test src/lib/paywall-remover/archive.test.ts`

```ts
// src/lib/paywall-remover/archive.ts
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
```

- [ ] `archive.ts` exists, availability / absent / error and URL-rewrite cases asserted, tests green

---

## Task 7 — The race

**Agent:** tdd -> worker

**Goal:** run both retrieval routes in parallel, take the first **complete**
result, prefer the publisher when both are complete, and abort the loser.

**Files:**
- `src/lib/paywall-remover/race.ts` (new)
- `src/lib/paywall-remover/race.test.ts` (new)

**The test that proves it:** `race.test.ts` drives `raceRoutes` with fake
runners and asserts: a fast publisher success wins; a fast publisher **failure**
does not win and the slower archive success is returned instead; when both
succeed and the publisher settled first the publisher's article is returned;
when the archive succeeds first but the publisher has already settled complete
the publisher still wins; the loser's `AbortSignal` is `aborted` after a winner
is chosen; both routes failing yields the publisher's reason when it is not
`timeout`, the archive's reason otherwise; and exceeding `deadlineMs` yields
`{ok:false, reason:'timeout'}` with both signals aborted. Timers are driven with
`vi.useFakeTimers()`.

**Verify:** `pnpm -F web test src/lib/paywall-remover/race.test.ts`

```ts
// src/lib/paywall-remover/race.ts
import type { ExtractResult, FailureReason, RouteOutcome } from './types'

export type Runners = {
  publisher: (signal: AbortSignal) => Promise<RouteOutcome>
  archive: (signal: AbortSignal) => Promise<RouteOutcome>
}

type Settled = { name: 'publisher' | 'archive'; outcome: RouteOutcome }

function pickReason(
  publisher: RouteOutcome | undefined,
  archive: RouteOutcome | undefined
): FailureReason {
  if (publisher && !publisher.ok && publisher.reason !== 'timeout')
    return publisher.reason
  if (archive && !archive.ok && archive.reason !== 'timeout')
    return archive.reason
  return 'timeout'
}

export async function raceRoutes(
  url: string,
  runners: Runners,
  options: { deadlineMs?: number } = {}
): Promise<ExtractResult> {
  const { deadlineMs = 8000 } = options

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deadlineMs)

  const settled: { publisher?: RouteOutcome; archive?: RouteOutcome } = {}

  const start = (name: Settled['name']): Promise<Settled> =>
    runners[name](controller.signal)
      .catch((): RouteOutcome => ({ ok: false, reason: 'timeout' }))
      .then((outcome) => {
        settled[name] = outcome
        return { name, outcome }
      })

  const publisher = start('publisher')
  const archive = start('archive')

  try {
    const first = await Promise.race([publisher, archive])

    // "A wins on tie": if the publisher is already complete when anything
    // settles, it is preferred over a snapshot that may be stale.
    if (settled.publisher?.ok) return { ok: true, article: settled.publisher.article }
    if (first.outcome.ok) return { ok: true, article: first.outcome.article }

    const second = await (first.name === 'publisher' ? archive : publisher)
    if (settled.publisher?.ok) return { ok: true, article: settled.publisher.article }
    if (second.outcome.ok) return { ok: true, article: second.outcome.article }

    return {
      ok: false,
      reason: pickReason(settled.publisher, settled.archive),
      url
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
```

- [ ] `race.ts` exists, all seven listed race cases asserted, tests green

---

## Task 8 — Pipeline and route handler

**Agent:** tdd -> worker

**Goal:** wire the pieces into `POST /api/paywall-remover`.

**Files:**
- `src/lib/paywall-remover/pipeline.ts` (new)
- `src/lib/paywall-remover/pipeline.test.ts` (new)
- `src/app/api/paywall-remover/route.ts` (new)
- `src/app/api/paywall-remover/route.test.ts` (new)

**The test that proves it:** `route.test.ts` (node environment) calls the
exported `POST` with a real `Request` and asserts: a body that is not JSON, a
missing `url`, and `url: "javascript:alert(1)"` each return `400` with
`reason: 'invalid-url'`; a valid URL with `extractArticle` mocked to succeed
returns `200` and the article JSON; mocked to fail with `blocked` returns `200`
and `{ok:false, reason:'blocked'}`. `pipeline.test.ts` asserts the publisher
runner reports `blocked` for a challenge page, `paywalled` when `assess` is not
`complete`, and that the archive runner reports `no-snapshot` when
`findSnapshot` returns `null`.

**Verify:** `pnpm -F web test src/lib/paywall-remover src/app/api` then
`pnpm -F web build` and confirm `/api/paywall-remover` is listed.

```ts
// src/lib/paywall-remover/pipeline.ts
import { findSnapshot, rawSnapshotUrl, snapshotDate } from './archive'
import { assess } from './completeness'
import { parseArticle, type Parsed } from './extract'
import { fetchPage, isChallengePage } from './fetch-page'
import { raceRoutes } from './race'
import type { Article, ExtractResult, RouteName, RouteOutcome } from './types'

function toArticle(
  parsed: Parsed,
  url: string,
  route: RouteName,
  snapshotAt: string | null
): Article {
  return {
    id: parsed.key,
    url,
    title: parsed.title,
    author: parsed.author,
    publishedAt: parsed.publishedAt,
    siteName: parsed.siteName,
    route,
    snapshotAt,
    blocks: parsed.blocks,
    savedAt: Date.now()
  }
}

export async function runPublisher(
  url: string,
  signal: AbortSignal
): Promise<RouteOutcome> {
  let page
  try {
    page = await fetchPage(url, { signal })
  } catch {
    return { ok: false, reason: 'blocked' }
  }

  if (isChallengePage(page.html)) return { ok: false, reason: 'blocked' }

  const parsed = parseArticle(page.html, page.finalUrl)
  if (!parsed) return { ok: false, reason: 'paywalled' }

  if (assess(parsed.declared, parsed.length) !== 'complete')
    return { ok: false, reason: 'paywalled' }

  return { ok: true, article: toArticle(parsed, url, 'publisher', null) }
}

export async function runArchive(
  url: string,
  signal: AbortSignal
): Promise<RouteOutcome> {
  let snapshot
  try {
    snapshot = await findSnapshot(url, { signal })
  } catch {
    return { ok: false, reason: 'no-snapshot' }
  }
  if (!snapshot) return { ok: false, reason: 'no-snapshot' }

  let page
  try {
    page = await fetchPage(rawSnapshotUrl(snapshot.url), { signal })
  } catch {
    return { ok: false, reason: 'no-snapshot' }
  }

  if (isChallengePage(page.html)) return { ok: false, reason: 'no-snapshot' }

  const parsed = parseArticle(page.html, url)
  if (!parsed) return { ok: false, reason: 'no-snapshot' }
  if (assess(parsed.declared, parsed.length) === 'paywalled')
    return { ok: false, reason: 'paywalled' }

  return {
    ok: true,
    article: toArticle(parsed, url, 'archive', snapshotDate(snapshot.timestamp))
  }
}

export function extractArticle(url: string): Promise<ExtractResult> {
  return raceRoutes(url, {
    publisher: (signal) => runPublisher(url, signal),
    archive: (signal) => runArchive(url, signal)
  })
}
```

```ts
// src/app/api/paywall-remover/route.ts
// No `runtime` export: nodejs is the default and edge is deprecated in 16.3.0.
import { normalizeUrl } from '@/lib/paywall-remover/normalize'
import { extractArticle } from '@/lib/paywall-remover/pipeline'

export const maxDuration = 20

function invalid(url: string) {
  return Response.json(
    { ok: false, reason: 'invalid-url', url },
    { status: 400 }
  )
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return invalid('')
  }

  const raw = (body as { url?: unknown })?.url
  if (typeof raw !== 'string') return invalid('')

  const url = normalizeUrl(raw)
  if (!url) return invalid(raw)

  return Response.json(await extractArticle(url))
}
```

- [ ] `pipeline.ts` and `route.ts` exist, all listed request cases asserted, tests green
- [ ] `pnpm -F web build` succeeds and lists `/api/paywall-remover`
