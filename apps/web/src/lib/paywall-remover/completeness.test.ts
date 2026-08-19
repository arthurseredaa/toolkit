/** @vitest-environment node */
import { parseHTML } from 'linkedom'
import { describe, expect, it } from 'vitest'

import { assess, readDeclaration } from './completeness'

const BODY = '<article id="article-body"><p>The story.</p></article>'

function docWith(head: string, body = BODY): Document {
  const { document } = parseHTML(
    `<!doctype html><html><head>${head}</head><body>${body}</body></html>`
  )
  return document as unknown as Document
}

function ldScript(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`
}

describe('readDeclaration', () => {
  it('reads a boolean isAccessibleForFree: false as a declared paywall', () => {
    const doc = docWith(
      ldScript({ '@type': 'NewsArticle', isAccessibleForFree: false })
    )

    expect(readDeclaration(doc)).toBe(false)
  })

  it('reads the schema.org string "False" as a declared paywall', () => {
    const doc = docWith(
      ldScript({ '@type': 'NewsArticle', isAccessibleForFree: 'False' })
    )

    expect(readDeclaration(doc)).toBe(false)
  })

  it('reads isAccessibleForFree: true as a declared free article', () => {
    const doc = docWith(
      ldScript({ '@type': 'NewsArticle', isAccessibleForFree: true })
    )

    expect(readDeclaration(doc)).toBe(true)
  })

  it('treats a hasPart whose cssSelector matches the page as a paywall', () => {
    const doc = docWith(
      ldScript({
        '@type': 'NewsArticle',
        hasPart: {
          '@type': 'WebPageElement',
          isAccessibleForFree: false,
          cssSelector: '#article-body'
        }
      })
    )

    expect(readDeclaration(doc)).toBe(false)
  })

  it('ignores a hasPart whose cssSelector matches nothing on the page', () => {
    const doc = docWith(
      ldScript({
        '@type': 'NewsArticle',
        hasPart: {
          '@type': 'WebPageElement',
          isAccessibleForFree: false,
          cssSelector: '.premium-only'
        }
      })
    )

    expect(readDeclaration(doc)).toBeNull()
  })

  it('returns null for a page carrying no JSON-LD', () => {
    expect(readDeclaration(docWith('<title>The story</title>'))).toBeNull()
  })

  it('returns null for malformed JSON-LD instead of throwing', () => {
    const doc = docWith(
      '<script type="application/ld+json">{ "@type": broken,, }</script>'
    )

    expect(readDeclaration(doc)).toBeNull()
  })
})

describe('assess', () => {
  it('calls a declared paywall paywalled at any length', () => {
    expect(assess(false, 0)).toBe('paywalled')
    expect(assess(false, 200)).toBe('paywalled')
    expect(assess(false, 40000)).toBe('paywalled')
  })

  it('trusts a declared free article even when it is short', () => {
    expect(assess(true, 200)).toBe('complete')
  })

  it('falls back to the length floor when nothing was declared', () => {
    expect(assess(null, 400)).toBe('suspicious')
    expect(assess(null, 4000)).toBe('complete')
  })
})
