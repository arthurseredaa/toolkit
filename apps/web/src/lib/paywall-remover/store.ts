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

      // One record per url. A row saved from the url alone arrives back under
      // a different id as soon as the page declares its canonical.
      const superseded = (a: Article) =>
        a.id === article.id || a.url === article.url

      for (const stale of articles.filter(superseded))
        if (stale.id !== article.id) await del(stale.id)

      set(newestFirst([...articles.filter((a) => !superseded(a)), article]))
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
