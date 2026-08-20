import { describe, expect, it } from 'vitest'

import { archiveTodayUrl, titleFromUrl, urlRecord } from './link'

describe('archiveTodayUrl', () => {
  it('points at the newest snapshot archive.today holds for the url', () => {
    expect(archiveTodayUrl('https://example.com/a/b?x=1')).toBe(
      'https://archive.is/newest/https://example.com/a/b?x=1'
    )
  })
})

describe('titleFromUrl', () => {
  it('reads the last path segment as words', () => {
    expect(
      titleFromUrl('https://example.com/2026/the-tunnel-under-the-harbour')
    ).toBe('the tunnel under the harbour')
  })

  it('drops the id many publishers append to the slug', () => {
    expect(
      titleFromUrl('https://medium.com/@a/a-setup-guide-b7b9fbc971bf')
    ).toBe('a setup guide')
  })

  it('drops a file extension', () => {
    expect(titleFromUrl('https://example.com/posts/one_two.html')).toBe(
      'one two'
    )
  })

  it('falls back to the hostname when the path carries no name', () => {
    expect(titleFromUrl('https://example.com/')).toBe('example.com')
  })

  it('returns the input unchanged when it is not a url at all', () => {
    expect(titleFromUrl('not a url')).toBe('not a url')
  })
})

describe('urlRecord', () => {
  it('is keyed by the url and named after it, with nothing read from the page', () => {
    const record = urlRecord('https://example.com/a/the-story')

    expect(record.id).toBe('https://example.com/a/the-story')
    expect(record.url).toBe('https://example.com/a/the-story')
    expect(record.title).toBe('the story')
    expect(record.author).toBeNull()
    expect(record.publishedAt).toBeNull()
    expect(record.siteName).toBeNull()
  })
})
