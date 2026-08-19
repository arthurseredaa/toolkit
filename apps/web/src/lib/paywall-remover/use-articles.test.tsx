import 'fake-indexeddb/auto'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { put } from './db'
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

// The hook reads the module-level shared store, so without a fresh module
// graph the second test starts on a store an earlier test already loaded and
// the loading state is unobservable.
async function mountProbe() {
  const { useArticles } = await import('./use-articles')
  const { articleStore } = await import('./store')

  let renders = 0

  function Probe() {
    const { articles, status } = useArticles()
    renders += 1

    return (
      <div>
        <p>{status}</p>
        <ul>
          {articles.map((saved) => (
            <li key={saved.id}>{saved.title}</li>
          ))}
        </ul>
      </div>
    )
  }

  const view = render(<Probe />)

  return {
    store: articleStore(),
    unmount: view.unmount,
    renders: () => renders
  }
}

beforeEach(() => {
  vi.resetModules()
  globalThis.indexedDB = new IDBFactory()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useArticles', () => {
  it('reports loading and no articles until the store has read the database', async () => {
    await put(article({ id: 'saved-earlier', title: 'Saved earlier' }))

    await mountProbe()

    expect(screen.getByText('loading')).toBeTruthy()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)

    await screen.findByText('ready')
    expect(
      screen.getAllByRole('listitem').map((item) => item.textContent)
    ).toEqual(['Saved earlier'])
  })

  it('re-renders with an article added to the store after mount', async () => {
    const probe = await mountProbe()
    await screen.findByText('ready')

    await act(async () => {
      await probe.store.add(
        article({ id: 'added-later', title: 'Added later' })
      )
    })

    expect(screen.getByText('Added later')).toBeTruthy()
  })

  it('stops listening to the store once the component unmounts', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})

    const probe = await mountProbe()
    await screen.findByText('ready')
    const rendersBeforeUnmount = probe.renders()

    probe.unmount()
    await act(async () => {
      await probe.store.add(article({ id: 'added-after-unmount' }))
    })

    expect(probe.renders()).toBe(rendersBeforeUnmount)
    expect(errors).not.toHaveBeenCalled()
  })
})
