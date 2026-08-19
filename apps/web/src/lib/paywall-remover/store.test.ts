import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { put, readAll } from './db'
import { createArticleStore } from './store'
import type { Article } from './types'

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'example.com/story',
    url: 'https://example.com/story',
    title: 'A story',
    author: 'A. Writer',
    publishedAt: '2024-01-15',
    siteName: 'Example',
    route: 'publisher',
    snapshotAt: null,
    blocks: [{ type: 'p', text: 'The first paragraph.' }],
    savedAt: 1700000000000,
    ...overrides
  }
}

// Private-mode Safari and storage pressure both refuse to open a database.
// Failing at the platform boundary keeps db.ts in the path under test.
function refuseToOpen() {
  globalThis.indexedDB = {
    open: () => {
      const request = {
        error: new DOMException('storage unavailable', 'InvalidStateError'),
        onerror: null as (() => void) | null
      }
      queueMicrotask(() => request.onerror?.())
      return request
    }
  } as unknown as IDBFactory
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('a store that has not loaded yet', () => {
  it('reports loading and holds no records', () => {
    const store = createArticleStore()

    expect(store.status()).toBe('loading')
    expect(store.all()).toEqual([])
  })

  it('still reports loading while load is in flight', async () => {
    await put(article())
    const store = createArticleStore()

    const pending = store.load()

    expect(store.status()).toBe('loading')
    expect(store.all()).toEqual([])

    await pending
  })
})

describe('load', () => {
  it('reports ready and returns records newest savedAt first', async () => {
    await put(article({ id: 'old', savedAt: 1 }))
    await put(article({ id: 'newest', savedAt: 3 }))
    await put(article({ id: 'middle', savedAt: 2 }))
    const store = createArticleStore()

    await store.load()

    expect(store.status()).toBe('ready')
    expect(store.all().map((saved) => saved.id)).toEqual([
      'newest',
      'middle',
      'old'
    ])
  })

  it('resolves without throwing when the database cannot be opened', async () => {
    refuseToOpen()
    const store = createArticleStore()

    await expect(store.load()).resolves.toBeUndefined()

    expect(store.status()).toBe('unavailable')
    expect(store.all()).toEqual([])
  })
})

describe('add', () => {
  it('persists the article so a second store loads it', async () => {
    const store = createArticleStore()
    await store.load()

    await store.add(article({ id: 'saved-one' }))

    const other = createArticleStore()
    await other.load()
    expect(other.all().map((saved) => saved.id)).toEqual(['saved-one'])
  })

  it('replaces the record when the id already exists', async () => {
    const store = createArticleStore()
    await store.load()

    await store.add(article({ title: 'First extraction', savedAt: 1 }))
    await store.add(article({ title: 'Second extraction', savedAt: 2 }))

    expect(store.all()).toHaveLength(1)
    expect(store.all()[0].title).toBe('Second extraction')
  })
})

describe('remove', () => {
  it('drops the article from memory and from the database', async () => {
    const store = createArticleStore()
    await store.load()
    await store.add(article({ id: 'a', savedAt: 2 }))
    await store.add(article({ id: 'b', savedAt: 1 }))

    await store.remove('a')

    expect(store.all().map((saved) => saved.id)).toEqual(['b'])
    expect((await readAll()).map((saved) => saved.id)).toEqual(['b'])
  })
})

describe('subscribe', () => {
  it('notifies the listener on load, add, remove and clear', async () => {
    const store = createArticleStore()
    const listener = vi.fn()
    store.subscribe(listener)

    await store.load()
    expect(listener).toHaveBeenCalledTimes(1)

    await store.add(article({ id: 'a' }))
    expect(listener).toHaveBeenCalledTimes(2)

    await store.remove('a')
    expect(listener).toHaveBeenCalledTimes(3)

    await store.clear()
    expect(listener).toHaveBeenCalledTimes(4)
  })

  it('stops notifying once the returned unsubscribe is called', async () => {
    const store = createArticleStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    await store.load()
    unsubscribe()
    await store.add(article())

    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('all', () => {
  // useSyncExternalStore compares with Object.is: a fresh array every read
  // re-renders forever.
  it('returns the same reference until the records change', async () => {
    const store = createArticleStore()
    await store.load()

    expect(store.all()).toBe(store.all())

    const before = store.all()
    await store.add(article())

    expect(store.all()).not.toBe(before)
    expect(store.all()).toBe(store.all())
  })
})
