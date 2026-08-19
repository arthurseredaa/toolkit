import type { Metadata } from 'next'
import Link from 'next/link'

import { Reader } from './reader'

export const metadata: Metadata = {
  title: 'Reader',
  description: 'An article saved in this browser.'
}

export default async function ArticlePage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Link
        href="/paywall-remover"
        className="font-mono text-xs text-muted-foreground hover:text-foreground"
      >
        ← Library
      </Link>
      <Reader slug={id} />
    </main>
  )
}
