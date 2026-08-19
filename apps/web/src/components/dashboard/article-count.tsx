'use client'

import { useArticles } from '@/lib/paywall-remover/use-articles'

export function ArticleCount() {
  const { articles, status } = useArticles()

  // A flash of "0 articles" before hydration is a worse lie than nothing.
  if (status !== 'ready') return null

  return (
    <>
      {articles.length} {articles.length === 1 ? 'article' : 'articles'}
    </>
  )
}
