/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { describeUrl } from './pipeline'

// Only the network boundary is mocked. `isChallengePage`, `readMetadata`,
// `canonicalKey` and `titleFromUrl` all run for real.
const fetchPage = vi.hoisted(() => vi.fn())

vi.mock('./fetch-page', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./fetch-page')>()),
  fetchPage
}))

const CANONICAL = 'https://harbourreview.example/2026/02/the-harbour-tunnel'
const TARGET = 'https://harbourreview.example/amp/2026/02/the-harbour-tunnel'
const NOW = 1770000000000

const LD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'NewsArticle',
  headline: 'The Tunnel Under the Harbour',
  author: { '@type': 'Person', name: 'Dana Reyes' },
  datePublished: '2026-02-11T08:30:00Z'
})

const PAGE = `<!doctype html>
<html><head>
<title>The Tunnel Under the Harbour | The Harbour Review</title>
<link rel="canonical" href="${CANONICAL}">
<meta property="og:site_name" content="The Harbour Review">
<script type="application/ld+json">${LD}</script>
</head>
<body><article><p>Prose that nobody here is going to read.</p></article></body>
</html>`

const CHALLENGE_PAGE =
  '<html><head><script>window._cf_chl_opt={cvId:"3"}</script></head>' +
  '<body>Just a moment...</body></html>'

const FROM_URL = {
  id: TARGET,
  url: TARGET,
  title: 'the harbour tunnel',
  author: null,
  publishedAt: null,
  siteName: null,
  savedAt: NOW
}

beforeEach(() => {
  fetchPage.mockReset()
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('describeUrl', () => {
  it('names the record from the page and keys it by the canonical url', async () => {
    fetchPage.mockResolvedValue({ html: PAGE, finalUrl: TARGET })

    await expect(describeUrl(TARGET)).resolves.toEqual({
      id: CANONICAL,
      url: TARGET,
      title: 'The Tunnel Under the Harbour',
      author: 'Dana Reyes',
      publishedAt: '2026-02-11T08:30:00Z',
      siteName: 'The Harbour Review',
      savedAt: NOW
    })
  })

  it('keeps none of the article text', async () => {
    fetchPage.mockResolvedValue({ html: PAGE, finalUrl: TARGET })

    const record = await describeUrl(TARGET)

    expect(JSON.stringify(record)).not.toContain('nobody here')
  })

  it('falls back to the url slug when the publisher refuses the fetch', async () => {
    fetchPage.mockRejectedValue(new Error('blocked'))

    await expect(describeUrl(TARGET)).resolves.toEqual(FROM_URL)
  })

  it('treats a challenge page as a page it never read', async () => {
    fetchPage.mockResolvedValue({ html: CHALLENGE_PAGE, finalUrl: TARGET })

    await expect(describeUrl(TARGET)).resolves.toEqual(FROM_URL)
  })
})
