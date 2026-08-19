/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runArchive, runPublisher } from './pipeline'

// Only the two network boundaries are mocked. `isChallengePage`,
// `rawSnapshotUrl`, `snapshotDate`, `parseArticle` and `assess` all run for
// real, so these tests exercise the wiring rather than a set of stubs.
const fetchPage = vi.hoisted(() => vi.fn())
const findSnapshot = vi.hoisted(() => vi.fn())

vi.mock('./fetch-page', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./fetch-page')>()),
  fetchPage
}))

vi.mock('./archive', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./archive')>()),
  findSnapshot
}))

const CANONICAL = 'https://harbourreview.example/2026/02/tunnel'
const TARGET = 'https://harbourreview.example/amp/2026/02/tunnel'
const NOW = 1770000000000

const SNAPSHOT = {
  url: `https://web.archive.org/web/20240115123045/${CANONICAL}`,
  timestamp: '20240115123045'
}

const RAW_SNAPSHOT = `https://web.archive.org/web/20240115123045id_/${CANONICAL}`

const LD = {
  '@context': 'https://schema.org',
  '@type': 'NewsArticle',
  headline: 'The Tunnel Under the Harbour',
  author: { '@type': 'Person', name: 'Dana Reyes' },
  publisher: { '@type': 'Organization', name: 'The Harbour Review' },
  datePublished: '2026-02-11T08:30:00Z'
}

const LEAD =
  'The tunnel opened on a Tuesday, and by Wednesday the ferry operators ' +
  'had already filed their first complaint with the transport regulator, ' +
  'arguing that a public crossing subsidised by the province amounted to ' +
  'unfair competition against a service that had run continuously since 1912.'

const BODY =
  'Boring through the harbour floor took four years longer than the ' +
  'original schedule allowed, largely because the survey had underestimated ' +
  'how much of the seabed was landfill rather than bedrock, which forced a ' +
  'redesign of the cutting head partway through the works.'

const CLOSE =
  'The province has not said whether the ferry licence will be renewed when ' +
  'it lapses in the spring, and the operators say they have had no meeting ' +
  'with the transport ministry since the crossing opened to traffic.'

function articlePage(free: boolean): string {
  const ld = JSON.stringify({ ...LD, isAccessibleForFree: free })

  return `<!doctype html>
<html><head>
<title>The Tunnel Under the Harbour | The Harbour Review</title>
<link rel="canonical" href="${CANONICAL}">
<script type="application/ld+json">${ld}</script>
</head>
<body>
<nav><a href="/">Home</a></nav>
<article>
<h1>The Tunnel Under the Harbour</h1>
<p>${LEAD}</p>
<h2>What the engineers found</h2>
<p>${BODY}</p>
<p>${CLOSE}</p>
</article>
<footer><p>Copyright the Harbour Review</p></footer>
</body></html>`
}

const FREE_PAGE = articlePage(true)
const PAYWALLED_PAGE = articlePage(false)

const CHALLENGE_PAGE =
  '<html><head><script>window._cf_chl_opt={cvId:"3"}</script></head>' +
  '<body>Just a moment...</body></html>'

const BLOCKS = [
  { type: 'p', text: LEAD },
  { type: 'h2', text: 'What the engineers found' },
  { type: 'p', text: BODY },
  { type: 'p', text: CLOSE }
]

let signal: AbortSignal

beforeEach(() => {
  signal = new AbortController().signal
  fetchPage.mockReset()
  findSnapshot.mockReset()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runPublisher', () => {
  it('reports blocked when the publisher serves a challenge page', async () => {
    fetchPage.mockResolvedValue({
      html: CHALLENGE_PAGE,
      finalUrl: TARGET
    })

    await expect(runPublisher(TARGET, signal)).resolves.toEqual({
      ok: false,
      reason: 'blocked'
    })
  })

  it('reports paywalled when the publisher declares the article is not free', async () => {
    fetchPage.mockResolvedValue({ html: PAYWALLED_PAGE, finalUrl: TARGET })

    await expect(runPublisher(TARGET, signal)).resolves.toEqual({
      ok: false,
      reason: 'paywalled'
    })
  })

  it('returns an undated article keyed by canonical url when the page is complete', async () => {
    fetchPage.mockResolvedValue({ html: FREE_PAGE, finalUrl: TARGET })

    await expect(runPublisher(TARGET, signal)).resolves.toEqual({
      ok: true,
      article: {
        id: CANONICAL,
        url: TARGET,
        title: 'The Tunnel Under the Harbour',
        author: 'Dana Reyes',
        publishedAt: '2026-02-11T08:30:00Z',
        siteName: 'The Harbour Review',
        route: 'publisher',
        snapshotAt: null,
        blocks: BLOCKS,
        savedAt: NOW
      }
    })
    // The race aborts the loser through this signal.
    expect(fetchPage).toHaveBeenCalledWith(TARGET, { signal })
  })
})

describe('runArchive', () => {
  it('reports no-snapshot when Wayback has no capture of the url', async () => {
    findSnapshot.mockResolvedValue(null)

    await expect(runArchive(TARGET, signal)).resolves.toEqual({
      ok: false,
      reason: 'no-snapshot'
    })
    expect(fetchPage).not.toHaveBeenCalled()
  })

  it('returns an article dated from the snapshot, read without the toolbar', async () => {
    findSnapshot.mockResolvedValue(SNAPSHOT)
    fetchPage.mockResolvedValue({ html: FREE_PAGE, finalUrl: RAW_SNAPSHOT })

    await expect(runArchive(TARGET, signal)).resolves.toEqual({
      ok: true,
      article: {
        id: CANONICAL,
        url: TARGET,
        title: 'The Tunnel Under the Harbour',
        author: 'Dana Reyes',
        publishedAt: '2026-02-11T08:30:00Z',
        siteName: 'The Harbour Review',
        route: 'archive',
        snapshotAt: '2024-01-15',
        blocks: BLOCKS,
        savedAt: NOW
      }
    })
    expect(fetchPage).toHaveBeenCalledWith(RAW_SNAPSHOT, { signal })
  })
})
