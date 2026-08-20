/** @vitest-environment node */
import { parseHTML } from 'linkedom'
import { describe, expect, it } from 'vitest'

import { readMetadata } from './metadata'

function doc(head: string): Document {
  return parseHTML(
    `<!doctype html><html><head>${head}</head><body></body></html>`
  ).document as unknown as Document
}

function ld(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`
}

describe('readMetadata', () => {
  it('prefers the declared og:title over the document title', () => {
    const found = readMetadata(
      doc(
        '<title>A Story | Example</title>' +
          '<meta property="og:title" content="A Story">'
      )
    )

    expect(found.title).toBe('A Story')
  })

  it('falls back to the document title when no tag declares one', () => {
    expect(readMetadata(doc('<title>A Story | Example</title>')).title).toBe(
      'A Story | Example'
    )
  })

  it('reads an author declared as a schema.org person', () => {
    const found = readMetadata(
      doc(ld({ author: { '@type': 'Person', name: 'Dana Reyes' } }))
    )

    expect(found.author).toBe('Dana Reyes')
  })

  it('joins the names when a page credits several authors', () => {
    const found = readMetadata(
      doc(ld({ author: [{ name: 'Dana Reyes' }, { name: 'Lee Okonkwo' }] }))
    )

    expect(found.author).toBe('Dana Reyes, Lee Okonkwo')
  })

  it('reaches metadata nested inside an @graph wrapper', () => {
    const found = readMetadata(
      doc(
        ld({
          '@graph': [
            { '@type': 'WebSite' },
            { datePublished: '2026-02-11T08:30:00Z' }
          ]
        })
      )
    )

    expect(found.publishedAt).toBe('2026-02-11T08:30:00Z')
  })

  it('falls back to the article:published_time meta tag', () => {
    const found = readMetadata(
      doc('<meta property="article:published_time" content="2026-02-11">')
    )

    expect(found.publishedAt).toBe('2026-02-11')
  })

  it('reads the site name from og:site_name before the schema.org publisher', () => {
    const found = readMetadata(
      doc(
        '<meta property="og:site_name" content="The Harbour Review">' +
          ld({ publisher: { name: 'Harbour Media Group' } })
      )
    )

    expect(found.siteName).toBe('The Harbour Review')
  })

  it('survives a malformed ld+json block', () => {
    const found = readMetadata(
      doc(
        '<script type="application/ld+json">{ not json</script>' +
          '<title>A Story</title>'
      )
    )

    expect(found.title).toBe('A Story')
  })

  it('returns nulls for a page that declares nothing', () => {
    expect(readMetadata(doc(''))).toEqual({
      title: null,
      author: null,
      publishedAt: null,
      siteName: null
    })
  })
})
