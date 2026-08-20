export type Article = {
  // The canonical url the page declared, normalized, else the url we were
  // given. One record per article, whichever variant of the link arrived.
  id: string
  url: string
  title: string
  author: string | null
  publishedAt: string | null
  siteName: string | null
  savedAt: number
}

// The only failure left: a string that is not a url this tool can open.
// Everything else still yields a record, because the article is read at
// archive.today and that link is built from the url alone.
export type ExtractResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'invalid-url'; url: string }
