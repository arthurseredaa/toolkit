import { describe, expect, it } from 'vitest'

import { canonicalKey, normalizeUrl } from './normalize'

const docFrom = (head: string): Document =>
  new DOMParser().parseFromString(
    `<!doctype html><html><head>${head}</head><body><p>x</p></body></html>`,
    'text/html'
  )

describe('normalizeUrl', () => {
  it('strips utm_*, fbclid and gclid but keeps real parameters', () => {
    const tracked =
      'https://example.com/story?utm_source=nl&utm_medium=email' +
      '&fbclid=abc&gclid=xyz&id=7'

    expect(normalizeUrl(tracked)).toBe('https://example.com/story?id=7')
  })

  it('drops the fragment', () => {
    expect(normalizeUrl('https://example.com/story#section-2')).toBe(
      'https://example.com/story'
    )
  })

  it('lowercases the host and leaves the path case alone', () => {
    expect(normalizeUrl('https://WWW.Example.COM/Story')).toBe(
      'https://www.example.com/Story'
    )
  })

  it('strips a trailing slash from a non-root path only', () => {
    expect(normalizeUrl('https://example.com/news/story/')).toBe(
      'https://example.com/news/story'
    )
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/')
  })

  it('sorts the remaining query parameters', () => {
    expect(normalizeUrl('https://example.com/s?c=3&a=1&b=2')).toBe(
      'https://example.com/s?a=1&b=2&c=3'
    )
  })

  it('returns null for javascript:, file: and unparseable input', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeUrl('not a url')).toBeNull()
    expect(normalizeUrl('')).toBeNull()
  })
})

describe('canonicalKey', () => {
  it('prefers link[rel=canonical] over og:url', () => {
    const doc = docFrom(
      '<link rel="canonical" href="https://example.com/canonical">' +
        '<meta property="og:url" content="https://example.com/og">'
    )

    expect(canonicalKey(doc, 'https://example.com/amp/story')).toBe(
      'https://example.com/canonical'
    )
  })

  it('falls back to og:url when there is no canonical link', () => {
    const doc = docFrom(
      '<meta property="og:url" content="https://example.com/og/?utm_source=x">'
    )

    expect(canonicalKey(doc, 'https://example.com/amp/story')).toBe(
      'https://example.com/og'
    )
  })

  it('resolves a relative canonical against the page URL', () => {
    const doc = docFrom('<link rel="canonical" href="/real/story">')

    expect(canonicalKey(doc, 'https://news.example.com/amp/story')).toBe(
      'https://news.example.com/real/story'
    )
  })

  it('falls back to the normalized page URL when neither is declared', () => {
    const doc = docFrom('<title>No canonical here</title>')
    const page = 'https://Example.com/story/?b=2&a=1&utm_source=nl#top'

    expect(canonicalKey(doc, page)).toBe('https://example.com/story?a=1&b=2')
  })
})
