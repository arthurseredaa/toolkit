'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { archiveTodayUrl } from '@/lib/paywall-remover/archive'
import { encodeId } from '@/lib/paywall-remover/ids'
import type { ExtractResult, FailureReason } from '@/lib/paywall-remover/types'
import { useArticles } from '@/lib/paywall-remover/use-articles'

import { SavedList } from './saved-list'

const MESSAGES: Record<FailureReason, string> = {
  'invalid-url': 'That is not a URL this tool can open.',
  blocked: 'The site blocked the request before the article loaded.',
  paywalled: 'Only a preview is public, and Wayback has no fuller copy.',
  'no-snapshot': 'Wayback has no copy of this page.',
  timeout: 'Neither the publisher nor the archive answered in time.'
}

type Failure = { reason: FailureReason; url: string }

export function Library() {
  const { articles, status, store } = useArticles()
  const router = useRouter()

  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  // A request outlives the component when it unmounts mid-flight (route
  // change, test teardown); the tail must not save or navigate for a
  // Library instance that is already gone.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  async function extract(target: string) {
    setBusy(true)
    setFailure(null)

    try {
      const response = await fetch('/api/paywall-remover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target })
      })
      const result = (await response.json()) as ExtractResult
      if (!mountedRef.current) return

      if (!result.ok) {
        setFailure({ reason: result.reason, url: target })
        return
      }

      // Save before navigating: the reader reads the store, not the network.
      await store.add(result.article)
      if (!mountedRef.current) return
      router.push(`/paywall-remover/${encodeId(result.article.id)}`)
    } catch {
      if (mountedRef.current) setFailure({ reason: 'timeout', url: target })
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }

  return (
    <div className="mt-8">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const target = url.trim()
          if (target) void extract(target)
        }}
      >
        <Input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/2026/an-article"
          aria-label="Article URL"
        />
        <Button type="submit" disabled={busy || url.trim().length === 0}>
          {busy ? 'Reading…' : 'Read'}
        </Button>
      </form>

      {failure && (
        <div className="mt-4 rounded-lg border border-border p-3">
          <p className="text-sm">{MESSAGES[failure.reason]}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {failure.reason !== 'invalid-url' && (
              <a
                href={archiveTodayUrl(failure.url)}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ size: 'sm' })}
              >
                Read on archive.is ↗
              </a>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void extract(failure.url)}
            >
              Try again
            </Button>
            <a
              href={failure.url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              Open the original ↗
            </a>
          </div>
        </div>
      )}

      <SavedList articles={articles} status={status} onDelete={store.remove} />
    </div>
  )
}
