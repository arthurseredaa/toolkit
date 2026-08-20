'use client'

import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { archiveTodayUrl, urlRecord } from '@/lib/paywall-remover/link'
import { normalizeUrl } from '@/lib/paywall-remover/normalize'
import type { ExtractResult } from '@/lib/paywall-remover/types'
import { useArticles } from '@/lib/paywall-remover/use-articles'

import { SavedList } from './saved-list'

export function Library() {
  const { articles, status, store } = useArticles()

  const [url, setUrl] = useState('')
  const [invalid, setInvalid] = useState(false)

  // The request outlives the component when it unmounts mid-flight (route
  // change, test teardown); the tail must not write for a Library that is
  // already gone.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Saved twice on purpose: once from the url alone, so the row exists before
  // the reader is back from archive.today, and again once the page has been
  // read for its real title.
  async function save(target: string) {
    await store.add(urlRecord(target))

    try {
      const response = await fetch('/api/paywall-remover', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target })
      })
      const result = (await response.json()) as ExtractResult
      if (!mountedRef.current || !result.ok) return

      await store.add(result.article)
    } catch {
      // The row is saved either way; it just keeps the name read off the url.
    }
  }

  function submit(raw: string) {
    const target = normalizeUrl(raw)
    if (!target) {
      setInvalid(true)
      return
    }

    setInvalid(false)
    setUrl('')

    // Opened inside the click, before anything is awaited: a tab opened after
    // a fetch resolves is a popup, and the browser blocks it.
    window.open(archiveTodayUrl(target), '_blank', 'noreferrer')

    void save(target)
  }

  return (
    <div className="mt-8">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          const raw = url.trim()
          if (raw) submit(raw)
        }}
      >
        <Input
          type="text"
          inputMode="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/2026/an-article"
          aria-label="Article URL"
        />
        <Button type="submit" disabled={url.trim().length === 0}>
          Read
        </Button>
      </form>

      {invalid && (
        <p className="mt-4 text-sm text-muted-foreground">
          That is not a URL this tool can open.
        </p>
      )}

      <SavedList articles={articles} status={status} onDelete={store.remove} />
    </div>
  )
}
