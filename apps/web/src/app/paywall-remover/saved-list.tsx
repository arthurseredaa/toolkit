'use client'

import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { encodeId } from '@/lib/paywall-remover/ids'
import type { StoreStatus } from '@/lib/paywall-remover/store'
import type { Article } from '@/lib/paywall-remover/types'

function source(article: Article): string {
  if (article.siteName) return article.siteName
  try {
    return new URL(article.url).hostname
  } catch {
    return article.url
  }
}

export function SavedList({
  articles,
  status,
  onDelete
}: {
  articles: Article[]
  status: StoreStatus
  onDelete: (id: string) => void
}) {
  if (status === 'loading') return null

  if (status === 'unavailable')
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        This browser will not let the tool store articles, so nothing is kept
        between visits.
      </p>
    )

  if (articles.length === 0)
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        Nothing saved yet. Paste a URL above.
      </p>
    )

  return (
    <ul className="mt-8 divide-y divide-border">
      {articles.map((article) => (
        <li
          key={article.id}
          className="flex items-center justify-between gap-4 py-3"
        >
          <Link
            href={`/paywall-remover/${encodeId(article.id)}`}
            className="min-w-0 flex-1"
          >
            <span className="block truncate text-sm">{article.title}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {source(article)}
            </span>
          </Link>
          <Button
            size="xs"
            variant="ghost"
            aria-label={`Delete ${article.title}`}
            onClick={() => onDelete(article.id)}
          >
            Delete
          </Button>
        </li>
      ))}
    </ul>
  )
}
