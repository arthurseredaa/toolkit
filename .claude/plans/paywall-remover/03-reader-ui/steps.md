# Steps — reader and library UI

Decisions: ./plan.md

All files live under `apps/web/`. Paths below are relative to that directory.

An article's `id` is its canonical URL, so it cannot be a path segment — an
encoded `/` is not reliably matched by a dynamic segment. Task 1 adds a
base64url codec used only for routing; the store still keys on the canonical URL.

Component tests use the default jsdom environment. Run after every task:
`pnpm -F web test`, `pnpm -F web typecheck`, `pnpm lint`. The pipeline commits
each task itself — do not run git.

---

## Task 1 — Route ids and article rendering

**Agent:** tdd -> worker

**Goal:** a URL-safe id codec, consecutive list items grouped into one `<ul>`,
and the article header with its route badge.

**Files:**
- `src/lib/paywall-remover/ids.ts` (new)
- `src/lib/paywall-remover/ids.test.ts` (new)
- `src/components/paywall-remover/article-body.tsx` (new)
- `src/components/paywall-remover/article-body.test.tsx` (new)

**The test that proves it:** `ids.test.ts` asserts `encodeId` round-trips
through `decodeId` for `https://example.com/a/b?x=1`, for a URL containing
non-ASCII characters, and that the encoded form matches `/^[A-Za-z0-9_-]+$/`
with no `/`, `+` or `=`; `decodeId` returns `null` for `'!!!'`.
`article-body.test.tsx` asserts `groupBlocks` folds three consecutive `li`
blocks into one list and splits when a `p` interrupts; that rendering an article
emits exactly one `<ul>` with three `<li>`s; that the header shows the title,
author and published date; that a `publisher` article's badge reads `publisher`
while an `archive` article's badge includes its `snapshotAt` date; and that a
link to the original with the article's URL is present.

**Verify:** `pnpm -F web test src/lib/paywall-remover/ids.test.ts src/components/paywall-remover`

```ts
// src/lib/paywall-remover/ids.ts
// Article ids are canonical URLs. base64url keeps them to one path segment.
export function encodeId(id: string): string {
  const bytes = new TextEncoder().encode(id)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function decodeId(slug: string): string | null {
  try {
    const base = slug.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base + '='.repeat((4 - (base.length % 4)) % 4)
    const binary = atob(padded)
    return new TextDecoder().decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0))
    )
  } catch {
    return null
  }
}
```

```tsx
// src/components/paywall-remover/article-body.tsx
import type { Article, Block } from '@/lib/paywall-remover/types'

export type Group = Block | { type: 'list'; items: string[] }

export function groupBlocks(blocks: Block[]): Group[] {
  const out: Group[] = []

  for (const block of blocks) {
    if (block.type !== 'li') {
      out.push(block)
      continue
    }

    const last = out[out.length - 1]
    if (last && last.type === 'list') last.items.push(block.text)
    else out.push({ type: 'list', items: [block.text] })
  }

  return out
}

function Badge({ article }: { article: Article }) {
  const label =
    article.route === 'publisher'
      ? 'publisher'
      : `archive · ${article.snapshotAt ?? 'undated'}`

  return (
    <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {label}
    </span>
  )
}

function Rendered({ group, index }: { group: Group; index: number }) {
  if (group.type === 'list')
    return (
      <ul className="ml-5 list-disc space-y-1">
        {group.items.map((item, i) => (
          <li key={`${index}-${i}`} className="text-[0.95rem] leading-7">
            {item}
          </li>
        ))}
      </ul>
    )

  if (group.type === 'h2')
    return (
      <h2 className="mt-8 text-lg font-medium tracking-tight">{group.text}</h2>
    )

  if (group.type === 'h3')
    return <h3 className="mt-6 text-base font-medium">{group.text}</h3>

  if (group.type === 'quote')
    return (
      <blockquote className="border-l-2 border-border pl-4 text-muted-foreground italic">
        {group.text}
      </blockquote>
    )

  return <p className="text-[0.95rem] leading-7">{group.text}</p>
}

export function ArticleBody({ article }: { article: Article }) {
  return (
    <article className="mt-8">
      <h1 className="text-2xl font-medium tracking-tight">{article.title}</h1>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {article.author && <span>{article.author}</span>}
        {article.publishedAt && (
          <time dateTime={article.publishedAt}>
            {article.publishedAt.slice(0, 10)}
          </time>
        )}
        <Badge article={article} />
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          className="font-mono hover:text-foreground"
        >
          original ↗
        </a>
      </div>

      <div className="mt-8 space-y-4">
        {groupBlocks(article.blocks).map((group, index) => (
          <Rendered key={index} group={group} index={index} />
        ))}
      </div>
    </article>
  )
}
```

- [x] `ids.ts` and `article-body.tsx` exist, codec / grouping / header / badge cases asserted, tests green

---

## Task 2 — The articles hook

**Agent:** tdd -> worker

**Goal:** one hook that hydrates the store once and re-renders on every change.

**Files:**
- `src/lib/paywall-remover/use-articles.ts` (new)
- `src/lib/paywall-remover/use-articles.test.tsx` (new)

**The test that proves it:** with `fake-indexeddb/auto` imported and
`globalThis.indexedDB` reset per test, `use-articles.test.tsx` renders a probe
component and asserts it first reports `status: 'loading'` with an empty list,
then re-renders to `'ready'` once `load()` resolves; that calling
`articleStore().add(...)` after mount re-renders the probe with the new article;
and that unmounting removes the listener, so a later `add()` does not warn about
updating an unmounted component.

**Verify:** `pnpm -F web test src/lib/paywall-remover/use-articles.test.tsx`

```ts
// src/lib/paywall-remover/use-articles.ts
'use client'

import { useEffect, useSyncExternalStore } from 'react'

import { articleStore, type StoreStatus } from './store'

const LOADING = (): StoreStatus => 'loading'

export function useArticles() {
  const store = articleStore()

  const articles = useSyncExternalStore(store.subscribe, store.all, store.all)
  const status = useSyncExternalStore(store.subscribe, store.status, LOADING)

  useEffect(() => {
    if (store.status() === 'loading') void store.load()
  }, [store])

  return { articles, status, store }
}
```

- [x] `use-articles.ts` exists, loading → ready, live update and unmount cases asserted, tests green

---

## Task 3 — The reader route

**Agent:** tdd -> worker

**Goal:** `/paywall-remover/[id]` renders a saved article from memory, and says
something useful when the id is not in the library.

**Files:**
- `src/app/paywall-remover/[id]/page.tsx` (new)
- `src/app/paywall-remover/[id]/reader.tsx` (new)
- `src/app/paywall-remover/[id]/reader.test.tsx` (new)

**The test that proves it:** `reader.test.tsx` seeds the store with one article,
awaits load, and asserts the reader renders its title and blocks for the
matching slug. For an unknown slug it asserts that **while `status` is
`'loading'` the recovery message is absent**, and that once `status` is `'ready'`
the text about the article not being in this library appears together with a
link back to `/paywall-remover`. A malformed slug takes the same path as an
unknown one.

**Verify:** `pnpm -F web test src/app/paywall-remover`

```tsx
// src/app/paywall-remover/[id]/page.tsx
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
```

```tsx
// src/app/paywall-remover/[id]/reader.tsx
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
```

- [x] `[id]` route exists, known / loading / unknown / malformed slug cases asserted, tests green

---

## Task 4 — The saved list and delete

**Agent:** tdd -> worker

**Goal:** every saved article listed, each openable, each deletable.

**Files:**
- `src/app/paywall-remover/saved-list.tsx` (new)
- `src/app/paywall-remover/saved-list.test.tsx` (new)

**The test that proves it:** `saved-list.test.tsx` asserts two articles render
newest first with links to `/paywall-remover/<encodeId(id)>`. ★ The delete test
**clicks the delete button** for the second article with `userEvent` and asserts
`onDelete` was called with exactly that article's id, and that no `window.confirm`
was invoked — a test that only queries for the button does not satisfy this step.
With `status: 'ready'` and no articles the empty sentence renders and **no button
appears anywhere in the output**; with `status: 'loading'` neither the empty
sentence nor the list renders; with `status: 'unavailable'` the storage sentence
renders.

**Verify:** `pnpm -F web test src/app/paywall-remover/saved-list.test.tsx`

```tsx
// src/app/paywall-remover/saved-list.tsx
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
```

- [ ] `saved-list.tsx` exists, ordering / links / **clicked delete** / three status states asserted, tests green

---

## Task 5 — Extraction form and failure recovery

**Agent:** tdd -> worker

**Goal:** the URL input extracts, saves, then navigates — and a failure shows a
reason with a retry that actually re-issues the request.

**Files:**
- `src/app/paywall-remover/page.tsx` (new)
- `src/app/paywall-remover/library.tsx` (new)
- `src/app/paywall-remover/library.test.tsx` (new)

**The test that proves it:** with `fetch` stubbed and `next/navigation` mocked,
`library.test.tsx` asserts: submitting a URL posts it to
`/api/paywall-remover`, and on success the article is in the store **before**
`router.push` is called with `/paywall-remover/<encodeId(id)>`; on
`{ok:false, reason:'blocked'}` the blocked sentence renders, nothing is added to
the store, and a link to the original URL is present. ★ The retry test **clicks
the Try again button** with `userEvent` and asserts `fetch` was called a second
time with the same URL — a test that only finds the button in the DOM does not
satisfy this step. A rejected `fetch` renders the timeout sentence.

**Verify:** `pnpm -F web test src/app/paywall-remover/library.test.tsx`

```tsx
// src/app/paywall-remover/page.tsx
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
```

```tsx
// src/app/paywall-remover/library.tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { encodeId } from '@/lib/paywall-remover/ids'
import type { ExtractResult, FailureReason } from '@/lib/paywall-remover/types'
import { useArticles } from '@/lib/paywall-remover/use-articles'

import { SavedList } from './saved-list'

const MESSAGES: Record<FailureReason, string> = {
  'invalid-url': 'That is not a URL this tool can open.',
  blocked: 'The site blocked the request before the article loaded.',
  paywalled: 'Only a preview was published, and no archived copy exists yet.',
  'no-snapshot': 'No archived copy of this page exists yet.',
  timeout: 'Neither the publisher nor the archive answered in time.'
}

type Failure = { reason: FailureReason; url: string }

export function Library() {
  const { articles, status, store } = useArticles()
  const router = useRouter()

  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

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

      if (!result.ok) {
        setFailure({ reason: result.reason, url: target })
        return
      }

      // Save before navigating: the reader reads the store, not the network.
      await store.add(result.article)
      router.push(`/paywall-remover/${encodeId(result.article.id)}`)
    } catch {
      setFailure({ reason: 'timeout', url: target })
    } finally {
      setBusy(false)
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
          <div className="mt-2 flex items-center gap-3">
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
```

- [ ] `page.tsx` and `library.tsx` exist, submit / save-before-navigate / failure / **clicked retry** cases asserted, tests green

---

## Task 6 — Dashboard count and card description

**Agent:** tdd -> worker

**Goal:** the tool card stops claiming a hardcoded `0 articles` and stops
promising something the tool does not do.

**Files:**
- `src/components/dashboard/article-count.tsx` (new)
- `src/components/dashboard/tool-grid.tsx` (edit)
- `src/components/dashboard/tools.ts` (edit)
- `src/components/dashboard/tool-grid.test.tsx` (edit)

**The test that proves it:** `tool-grid.test.tsx` gains cases asserting that
before `load()` resolves the paywall-remover card renders **no** stat text —
specifically not `0 articles`; that after two articles are in the store it reads
`2 articles`; that one article reads `1 article`; and that every other card
still renders its own `stat` string unchanged. A separate case asserts the card
description no longer contains "without paywalls".

**Verify:** `pnpm -F web test src/components/dashboard`

```tsx
// src/components/dashboard/article-count.tsx
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
```

In `tool-grid.tsx`, import `ArticleCount` and replace the stat line:

```tsx
              <div className="px-(--card-spacing) font-mono text-xs text-muted-foreground">
                {tool.slug === 'paywall-remover' ? <ArticleCount /> : tool.stat}
              </div>
```

In `tools.ts`, change only the `paywall-remover` entry:

```ts
  {
    slug: 'paywall-remover',
    name: 'Paywall Remover',
    description: 'Reader with an offline library',
    stat: ''
  }
```

- [ ] `article-count.tsx` exists, grid and tools edited, hydration / pluralisation / other-cards cases asserted, tests green
- [ ] `pnpm -F web build` succeeds and lists `/paywall-remover` and `/paywall-remover/[id]`
