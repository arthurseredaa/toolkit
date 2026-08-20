import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAll, del, put, readAll } from './db'
import type { Article } from './types'

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'example.com/story',
    url: 'https://example.com/story',
    title: 'A story',
    author: 'A. Writer',
    publishedAt: '2024-01-15',
    siteName: 'Example',
    savedAt: 1700000000000,
    ...overrides
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

describe('readAll', () => {
  it('returns an empty array for a database that has never been written to', async () => {
    await expect(readAll()).resolves.toEqual([])
  })
})

describe('put', () => {
  it('round-trips an article with its blocks array intact', async () => {
    const saved = article()

    await put(saved)

    await expect(readAll()).resolves.toEqual([saved])
  })

  it('overwrites the record when the id already exists instead of duplicating it', async () => {
    await put(article({ title: 'First extraction', savedAt: 1 }))
    await put(article({ title: 'Second extraction', savedAt: 2 }))

    const all = await readAll()

    expect(all).toHaveLength(1)
    expect(all[0].title).toBe('Second extraction')
    expect(all[0].savedAt).toBe(2)
  })

  // A `Date` survives structured clone unchanged, so it cannot pin this trap.
  // A function is what the algorithm actually refuses.
  it('rejects when the article carries a value structured clone cannot copy', async () => {
    const uncloneable = {
      ...article(),
      onOpen: () => {}
    } as unknown as Article

    await expect(put(uncloneable)).rejects.toThrow(
      expect.objectContaining({ name: 'DataCloneError' })
    )
  })
})

describe('del', () => {
  it('removes only the record with the given id', async () => {
    await put(article({ id: 'a' }))
    await put(article({ id: 'b' }))

    await del('a')

    expect((await readAll()).map((saved) => saved.id)).toEqual(['b'])
  })
})

describe('clearAll', () => {
  it('empties the store', async () => {
    await put(article({ id: 'a' }))
    await put(article({ id: 'b' }))

    await clearAll()

    await expect(readAll()).resolves.toEqual([])
  })
})
