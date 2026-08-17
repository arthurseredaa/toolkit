import type { Metadata } from 'next'
import Link from 'next/link'

import { Compressor } from './compressor'

export const metadata: Metadata = {
  title: 'Compress',
  description: 'Lossy photo compression, entirely in the browser.'
}

export default function CompressPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Link
        href="/"
        className="font-mono text-xs text-muted-foreground hover:text-foreground"
      >
        ← Tools
      </Link>
      <h1 className="mt-6 text-2xl font-medium tracking-tight">Compress</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Lossy, on this device. Photos never leave the browser.
      </p>
      <Compressor />
    </main>
  )
}
