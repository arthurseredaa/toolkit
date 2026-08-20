import type { Metadata } from 'next'
import Link from 'next/link'

import { Library } from './library'

export const metadata: Metadata = {
  title: 'Paywall Remover',
  description: 'Open an article at archive.today and keep the link.'
}

export default function PaywallRemoverPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Link
        href="/"
        className="font-mono text-xs text-muted-foreground hover:text-foreground"
      >
        ← Tools
      </Link>
      <h1 className="mt-6 text-2xl font-medium tracking-tight">
        Paywall Remover
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Opens the article at archive.today and keeps the link in this browser,
        named after the page it points at.
      </p>
      <Library />
    </main>
  )
}
