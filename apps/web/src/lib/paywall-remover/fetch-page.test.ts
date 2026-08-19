/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchPage, isChallengePage } from './fetch-page'

// The address guard resolves DNS. These tests are about hops, status codes and
// body size, so it is stubbed to pass and asserted on for re-validation only.
const assertPublicUrl = vi.hoisted(() => vi.fn())

vi.mock('./ssrf', () => ({ assertPublicUrl }))

const MB = 1024 * 1024
const ARTICLE = '<html><body><article><p>The story.</p></article></body></html>'

const fetchMock = vi.fn()

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8' }
  })
}

function redirectTo(location: string | null): Response {
  return new Response(null, {
    status: 302,
    headers: location ? { location } : {}
  })
}

/**
 * A response whose body arrives as 1 MB chunks, so the test can observe how
 * many were pulled and whether the reader was cancelled.
 */
function streamedHtml(chunkCount: number) {
  let pulled = 0
  let cancelled = false

  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled === chunkCount) {
        controller.close()
        return
      }
      pulled += 1
      controller.enqueue(new TextEncoder().encode('a'.repeat(MB)))
    },
    cancel() {
      cancelled = true
    }
  })

  const response = {
    status: 200,
    ok: true,
    headers: new Headers({ 'content-type': 'text/html' }),
    body,
    text: () => Promise.resolve('a'.repeat(MB * chunkCount))
  } as unknown as Response

  return {
    response,
    get pulled() {
      return pulled
    },
    get cancelled() {
      return cancelled
    }
  }
}

beforeEach(() => {
  assertPublicUrl.mockReset()
  assertPublicUrl.mockImplementation((input: string) =>
    Promise.resolve(new URL(input))
  )
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchPage', () => {
  it('returns the body and the url it was read from', async () => {
    fetchMock.mockResolvedValue(htmlResponse(ARTICLE))

    const page = await fetchPage('https://example.com/story')

    expect(page).toEqual({
      html: ARTICLE,
      finalUrl: 'https://example.com/story'
    })
  })

  it('follows a 302 and re-validates the new hop before fetching it', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo('https://cdn.example.net/story'))
      .mockResolvedValueOnce(htmlResponse(ARTICLE))

    const page = await fetchPage('https://example.com/story')

    expect(page.finalUrl).toBe('https://cdn.example.net/story')
    expect(assertPublicUrl).toHaveBeenCalledTimes(2)
    expect(assertPublicUrl).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example.net/story'
    )
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      'https://cdn.example.net/story'
    )
    // Without manual redirects the guard never sees the later hops.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
  })

  it('resolves a relative location against the hop it came from', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo('/story-final'))
      .mockResolvedValueOnce(htmlResponse(ARTICLE))

    const page = await fetchPage('https://example.com/section/story')

    expect(assertPublicUrl).toHaveBeenNthCalledWith(
      2,
      'https://example.com/story-final'
    )
    expect(page.finalUrl).toBe('https://example.com/story-final')
  })

  it('accepts a page reached after exactly three redirects', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectTo('https://example.com/1'))
      .mockResolvedValueOnce(redirectTo('https://example.com/2'))
      .mockResolvedValueOnce(redirectTo('https://example.com/3'))
      .mockResolvedValueOnce(htmlResponse(ARTICLE))

    const page = await fetchPage('https://example.com/story')

    expect(page.finalUrl).toBe('https://example.com/3')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('throws blocked on a fourth redirect', async () => {
    fetchMock.mockResolvedValue(redirectTo('https://example.com/next'))

    await expect(fetchPage('https://example.com/story')).rejects.toThrow(
      'blocked'
    )
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('throws blocked when a redirect carries no location header', async () => {
    fetchMock.mockResolvedValueOnce(redirectTo(null))

    await expect(fetchPage('https://example.com/story')).rejects.toThrow(
      'blocked'
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws blocked on a 403', async () => {
    fetchMock.mockResolvedValue(
      new Response('Forbidden', {
        status: 403,
        headers: { 'content-type': 'text/html' }
      })
    )

    await expect(fetchPage('https://example.com/story')).rejects.toThrow(
      'blocked'
    )
  })

  it('throws blocked when the content-type is not html', async () => {
    fetchMock.mockResolvedValue(
      new Response('binary', { headers: { 'content-type': 'video/mp4' } })
    )

    await expect(fetchPage('https://example.com/clip.mp4')).rejects.toThrow(
      'blocked'
    )
  })

  it('truncates a body larger than the 5 MB cap instead of buffering it whole', async () => {
    const source = streamedHtml(8)
    fetchMock.mockResolvedValue(source.response)

    const page = await fetchPage('https://example.com/huge')

    expect(page.html.length).toBe(5 * MB)
    expect(source.cancelled).toBe(true)
    expect(source.pulled).toBeLessThan(8)
  })
})

describe('isChallengePage', () => {
  it('recognises a Cloudflare challenge', () => {
    expect(
      isChallengePage(
        '<html><head><script>window._cf_chl_opt={cvId:"3"}</script></head></html>'
      )
    ).toBe(true)
  })

  it('does not flag ordinary article html', () => {
    expect(isChallengePage(ARTICLE)).toBe(false)
  })
})
