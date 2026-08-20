import { parseHTML } from 'linkedom'

import { fetchPage, isChallengePage } from './fetch-page'
import { titleFromUrl, urlRecord } from './link'
import { readMetadata } from './metadata'
import { canonicalKey } from './normalize'
import type { Article } from './types'

// The page is fetched for its name and nothing else: the article itself is
// read at archive.today. So no failure here needs a reason the reader hears
// about — a page we cannot open still yields a row and a working link out.
export async function describeUrl(url: string): Promise<Article> {
  let page
  try {
    page = await fetchPage(url)
  } catch {
    return urlRecord(url)
  }

  if (isChallengePage(page.html)) return urlRecord(url)

  const { document } = parseHTML(page.html)
  const doc = document as unknown as Document
  const found = readMetadata(doc)

  return {
    id: canonicalKey(doc, page.finalUrl),
    url,
    title: found.title ?? titleFromUrl(url),
    author: found.author,
    publishedAt: found.publishedAt,
    siteName: found.siteName,
    savedAt: Date.now()
  }
}
