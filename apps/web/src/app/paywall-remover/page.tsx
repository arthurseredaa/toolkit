import type { Metadata } from 'next'
import Link from 'next/link'

import { Library } from './library'

export const metadata: Metadata = {
  title: 'Paywall Remover',
  description: 'Read an article and keep it in a local library.'
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
        Reads the publisher&apos;s own payload or a public archive, then keeps
        the article in this browser.
      </p>
      <Library />
    </main>
  )
}
