# Steps — article library store

Decisions: ./plan.md

All files live under `apps/web/`. Paths below are relative to that directory.
`fake-indexeddb@^6.2.5` is already installed — no task installs anything.

Both test files run in the default jsdom environment and open with
`import 'fake-indexeddb/auto'`, then reset the backing store in `beforeEach`
with `globalThis.indexedDB = new IDBFactory()` so no test sees another's records.

Run after every task: `pnpm -F web test`, `pnpm -F web typecheck`, `pnpm lint`.
The pipeline commits each task itself — do not run git.

---

## Task 1 — IndexedDB access layer

**Agent:** tdd -> worker

**Goal:** four operations against one object store, each resolving only when the
transaction has actually committed.

**Files:**
- `src/lib/paywall-remover/db.ts` (new)
- `src/lib/paywall-remover/db.test.ts` (new)

**The test that proves it:** `db.test.ts` asserts that `put` then `readAll`
round-trips an `Article` with its `blocks` array intact; that `put` with an `id`
that already exists overwrites rather than duplicating, leaving `readAll` with
one record; that `del` removes exactly one record; that `clearAll` empties the
store; and that `readAll` on a fresh database returns `[]`. One test writes an
article carrying a `Date` in place of a string and asserts the failure surfaces
as a rejected promise, pinning the structured-clone trap from `./plan.md`.

**Verify:** `pnpm -F web test src/lib/paywall-remover/db.test.ts`

```ts
// src/lib/paywall-remover/db.ts
import type { Article } from './types'

const DB_NAME = 'paywall-remover'
const DB_VERSION = 1
const STORE = 'articles'

function fail(source: { error: DOMException | null }): Error {
  return source.error ?? new Error('indexeddb')
}

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex(
          'savedAt',
          'savedAt'
        )
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(fail(request))
    request.onblocked = () => reject(new Error('indexeddb'))
  })
}

// Resolving on request.onsuccess is not enough — the transaction can still
// abort afterwards, and the write would be silently lost.
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(fail(tx))
    tx.onabort = () => reject(fail(tx))
  })
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(fail(req))
  })
}

async function write(
  run: (store: IDBObjectStore) => void
): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    run(tx.objectStore(STORE))
    await committed(tx)
  } finally {
    db.close()
  }
}

export async function readAll(): Promise<Article[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const all = await request(
      tx.objectStore(STORE).getAll() as IDBRequest<Article[]>
    )
    await committed(tx)
    return all
  } finally {
    db.close()
  }
}

export function put(article: Article): Promise<void> {
  return write((store) => store.put(article))
}

export function del(id: string): Promise<void> {
  return write((store) => store.delete(id))
}

export function clearAll(): Promise<void> {
  return write((store) => store.clear())
}
```

- [x] `db.ts` exists, round-trip / overwrite / delete / clear / empty / clone-failure cases asserted, tests green

---

## Task 2 — The article store

**Agent:** tdd -> worker

**Goal:** a `useSyncExternalStore`-compatible store holding whole articles in
memory, backed by `db.ts`.

**Files:**
- `src/lib/paywall-remover/store.ts` (new)
- `src/lib/paywall-remover/store.test.ts` (new)

**The test that proves it:** `store.test.ts` asserts that `status()` is
`'loading'` and `all()` is `[]` before `load()` resolves; that after `load()`
`status()` is `'ready'` and records come back newest-`savedAt` first; that
`add()` persists so a second store's `load()` sees the record; that adding an
article whose `id` already exists replaces it and leaves `all()` with one entry;
that `remove()` drops it from both memory and disk; that `subscribe` fires on
`load`, `add`, `remove` and `clear`, and that the returned unsubscribe stops it;
that **`all()` returns the identical reference across two calls with no mutation
between them** and a different reference after `add()`; and that when `openDb`
is mocked to reject, `load()` resolves without throwing and `status()` becomes
`'unavailable'`.

**Verify:** `pnpm -F web test src/lib/paywall-remover/store.test.ts`

```ts
// src/lib/paywall-remover/store.ts
import { clearAll, del, put, readAll } from './db'
import type { Article } from './types'

export type StoreStatus = 'loading' | 'ready' | 'unavailable'

export type ArticleStore = {
  all(): Article[]
  status(): StoreStatus
  load(): Promise<void>
  add(article: Article): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
  subscribe(listener: () => void): () => void
}

function newestFirst(list: Article[]): Article[] {
  return [...list].sort((a, b) => b.savedAt - a.savedAt)
}

export function createArticleStore(): ArticleStore {
  // Replaced, never mutated: useSyncExternalStore compares with Object.is.
  let articles: Article[] = []
  let state: StoreStatus = 'loading'
  const listeners = new Set<() => void>()

  function emit() {
    for (const listener of listeners) listener()
  }

  function set(next: Article[]) {
    articles = next
    emit()
  }

  return {
    all: () => articles,
    status: () => state,

    async load() {
      try {
        articles = newestFirst(await readAll())
        state = 'ready'
      } catch {
        state = 'unavailable'
      }
      emit()
    },

    async add(article) {
      await put(article)
      set(newestFirst([...articles.filter((a) => a.id !== article.id), article]))
    },

    async remove(id) {
      await del(id)
      set(articles.filter((a) => a.id !== id))
    },

    async clear() {
      await clearAll()
      set([])
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

// The page and the dashboard card must observe the same records.
let shared: ArticleStore | null = null

export function articleStore(): ArticleStore {
  shared ??= createArticleStore()
  return shared
}
```

- [x] `store.ts` exists, all listed store cases asserted including reference stability, tests green
