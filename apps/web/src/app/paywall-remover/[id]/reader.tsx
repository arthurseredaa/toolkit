'use client'

import Link from 'next/link'

import { ArticleBody } from '@/components/paywall-remover/article-body'
import { decodeId } from '@/lib/paywall-remover/ids'
import { useArticles } from '@/lib/paywall-remover/use-articles'

export function Reader({ slug }: { slug: string }) {
  const { articles, status } = useArticles()

  const id = decodeId(slug)
  const article = id ? articles.find((a) => a.id === id) : undefined

  if (article) return <ArticleBody article={article} />

  // Before load resolves, "missing" only means "not read from disk yet".
  if (status === 'loading') return null

  return (
    <div className="mt-8">
      <p className="text-sm text-muted-foreground">
        That article is not in your library on this device.
      </p>
      <Link
        href="/paywall-remover"
        className="mt-2 inline-block font-mono text-xs hover:text-foreground"
      >
        Back to the library
      </Link>
    </div>
  )
}
