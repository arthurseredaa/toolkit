import type { Article } from './types'

// archive.today holds a readable copy of most paywalled articles, but answers
// automated clients with a captcha on every mirror. A real browser is served
// normally, so this is a link the reader follows, never a fetch we make.
export function archiveTodayUrl(target: string): string {
  return `https://archive.is/newest/${target}`
}

// A slug is the only name a url carries on its own. Medium and friends append
// a hash to it, which is an id rather than part of the name.
export function titleFromUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }

  const slug = parsed.pathname.split('/').filter(Boolean).pop()
  if (!slug) return parsed.hostname

  const words = slug
    .replace(/\.\w{2,5}$/, '')
    .split(/[-_]/)
    .filter((word) => word.length > 0 && !/^[0-9a-f]{8,}$/i.test(word))
    .join(' ')

  return words || parsed.hostname
}

// What a url is worth before anyone has read the page: enough for a row in the
// library and a working link out. The server replaces it once it knows better.
export function urlRecord(url: string): Article {
  return {
    id: url,
    url,
    title: titleFromUrl(url),
    author: null,
    publishedAt: null,
    siteName: null,
    savedAt: Date.now()
  }
}
