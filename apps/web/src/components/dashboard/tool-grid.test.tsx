import 'fake-indexeddb/auto'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { put } from '@/lib/paywall-remover/db'
import type { Article } from '@/lib/paywall-remover/types'

import { setMatchMedia } from '../../../vitest.setup'
import { tools } from './tools'

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

// The paywall card counts the module-level article store, so each test needs a
// fresh module graph or it starts on a store an earlier test already loaded.
async function mountGrid() {
  const { ToolGrid } = await import('./tool-grid')
  const { articleStore } = await import('@/lib/paywall-remover/store')

  render(<ToolGrid tools={tools} />)

  return articleStore()
}

// Resolving the load inside act keeps the update from landing after the test.
async function renderGrid() {
  const store = await mountGrid()
  await act(async () => {
    await store.load()
  })
}

function paywallCard() {
  return screen.getByRole('link', { name: /paywall remover/i })
}

beforeEach(() => {
  vi.resetModules()
  globalThis.indexedDB = new IDBFactory()
})

describe('ToolGrid', () => {
  it('renders one link per tool', async () => {
    await renderGrid()
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })

  it('links each tool to its own route', async () => {
    await renderGrid()
    expect(
      screen.getByRole('link', { name: /compress/i }).getAttribute('href')
    ).toBe('/compress')
    expect(paywallCard().getAttribute('href')).toBe('/paywall-remover')
  })

  it('shows the name, description and stat for a tool', async () => {
    await renderGrid()
    expect(screen.getByText('Vinted')).toBeDefined()
    expect(screen.getByText('Listings and profit')).toBeDefined()
    expect(screen.getByText('38 active')).toBeDefined()
  })

  it('still renders every tool when reduced motion is preferred', async () => {
    setMatchMedia(true)
    await renderGrid()
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })

  it('takes every other stat from the list and shows no count until the store has loaded', async () => {
    const store = await mountGrid()

    const others = tools.filter((tool) => tool.slug !== 'paywall-remover')
    for (const other of others)
      expect(screen.getByText(other.stat)).toBeDefined()

    expect(paywallCard().textContent).not.toContain('0 articles')
    expect(paywallCard().textContent).not.toMatch(/\d+ articles?/)

    await act(async () => {
      await store.load()
    })

    expect(paywallCard().textContent).toContain('0 articles')
  })

  it('counts two saved articles as 2 articles', async () => {
    await put(article({ id: 'first', title: 'First' }))
    await put(article({ id: 'second', title: 'Second' }))

    await renderGrid()

    expect(paywallCard().textContent).toContain('2 articles')
  })

  it('counts one saved article as 1 article, singular', async () => {
    await put(article({ id: 'only', title: 'Only' }))

    await renderGrid()

    expect(paywallCard().textContent).toMatch(/1 article(?!s)/)
  })

  it('no longer describes the tool as reading without paywalls', () => {
    const card = tools.find((tool) => tool.slug === 'paywall-remover')

    expect(card?.description).toBeDefined()
    expect(card?.description).not.toMatch(/without paywalls/i)
  })
})
