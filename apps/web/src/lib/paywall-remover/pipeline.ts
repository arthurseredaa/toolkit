import { findSnapshot, rawSnapshotUrl, snapshotDate } from './archive'
import { assess } from './completeness'
import { parseArticle, type Parsed } from './extract'
import { fetchPage, isChallengePage } from './fetch-page'
import { raceRoutes } from './race'
import type { Article, ExtractResult, RouteName, RouteOutcome } from './types'

function toArticle(
  parsed: Parsed,
  url: string,
  route: RouteName,
  snapshotAt: string | null
): Article {
  return {
    id: parsed.key,
    url,
    title: parsed.title,
    author: parsed.author,
    publishedAt: parsed.publishedAt,
    siteName: parsed.siteName,
    route,
    snapshotAt,
    blocks: parsed.blocks,
    savedAt: Date.now()
  }
}

export async function runPublisher(
  url: string,
  signal: AbortSignal
): Promise<RouteOutcome> {
  let page
  try {
    page = await fetchPage(url, { signal })
  } catch {
    return { ok: false, reason: 'blocked' }
  }

  if (isChallengePage(page.html)) return { ok: false, reason: 'blocked' }

  const parsed = parseArticle(page.html, page.finalUrl)
  if (!parsed) return { ok: false, reason: 'paywalled' }

  if (assess(parsed.declared, parsed.length) !== 'complete')
    return { ok: false, reason: 'paywalled' }

  return { ok: true, article: toArticle(parsed, url, 'publisher', null) }
}

export async function runArchive(
  url: string,
  signal: AbortSignal
): Promise<RouteOutcome> {
  let snapshot
  try {
    snapshot = await findSnapshot(url, { signal })
  } catch {
    return { ok: false, reason: 'no-snapshot' }
  }
  if (!snapshot) return { ok: false, reason: 'no-snapshot' }

  let page
  try {
    page = await fetchPage(rawSnapshotUrl(snapshot.url), { signal })
  } catch {
    return { ok: false, reason: 'no-snapshot' }
  }

  if (isChallengePage(page.html)) return { ok: false, reason: 'no-snapshot' }

  const parsed = parseArticle(page.html, url)
  if (!parsed) return { ok: false, reason: 'no-snapshot' }
  if (assess(parsed.declared, parsed.length) === 'paywalled')
    return { ok: false, reason: 'paywalled' }

  return {
    ok: true,
    article: toArticle(parsed, url, 'archive', snapshotDate(snapshot.timestamp))
  }
}

export function extractArticle(url: string): Promise<ExtractResult> {
  return raceRoutes(url, {
    publisher: (signal) => runPublisher(url, signal),
    archive: (signal) => runArchive(url, signal)
  })
}
