/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Article, ExtractResult } from '@/lib/paywall-remover/types'

import { POST } from './route'

// The pipeline is the whole network boundary for this handler. Everything the
// handler itself does — parse, validate, normalize, serialise — runs for real.
const extractArticle = vi.hoisted(() => vi.fn())

vi.mock('@/lib/paywall-remover/pipeline', () => ({ extractArticle }))

const CANONICAL = 'https://harbourreview.example/2026/02/tunnel'

const ARTICLE: Article = {
  id: CANONICAL,
  url: CANONICAL,
  title: 'The Tunnel Under the Harbour',
  author: 'Dana Reyes',
  publishedAt: '2026-02-11T08:30:00Z',
  siteName: 'The Harbour Review',
  route: 'publisher',
  snapshotAt: null,
  blocks: [{ type: 'p', text: 'The tunnel opened on a Tuesday.' }],
  savedAt: 1770000000000
}

function post(body: string): Request {
  return new Request('https://toolkit.test/api/paywall-remover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body
  })
}

function resolvesWith(result: ExtractResult) {
  extractArticle.mockResolvedValue(result)
}

beforeEach(() => {
  extractArticle.mockReset()
})

describe('POST /api/paywall-remover', () => {
  it('rejects a body that is not json', async () => {
    const response = await POST(post('{ not json'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      reason: 'invalid-url',
      url: ''
    })
  })

  it('rejects a body carrying no url', async () => {
    const response = await POST(post(JSON.stringify({ link: CANONICAL })))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      reason: 'invalid-url',
      url: ''
    })
  })

  it('rejects a javascript: url without reaching the pipeline', async () => {
    const response = await POST(
      post(JSON.stringify({ url: 'javascript:alert(1)' }))
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      reason: 'invalid-url',
      url: 'javascript:alert(1)'
    })
    expect(extractArticle).not.toHaveBeenCalled()
  })

  it('extracts the normalized url and returns the article', async () => {
    resolvesWith({ ok: true, article: ARTICLE })

    const response = await POST(
      post(
        JSON.stringify({
          url: 'HTTPS://Harbourreview.EXAMPLE/2026/02/tunnel/?utm_source=nl'
        })
      )
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      article: ARTICLE
    })
    expect(extractArticle).toHaveBeenCalledWith(CANONICAL)
  })

  it('returns 200 with the failure reason when extraction is blocked', async () => {
    resolvesWith({ ok: false, reason: 'blocked', url: CANONICAL })

    const response = await POST(post(JSON.stringify({ url: CANONICAL })))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      reason: 'blocked',
      url: CANONICAL
    })
  })
})
