import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { put } from '@/lib/paywall-remover/db'
import { encodeId } from '@/lib/paywall-remover/ids'
import type { Article } from '@/lib/paywall-remover/types'

const saved: Article = {
  id: 'example.com/story',
  url: 'https://example.com/story',
  title: 'A story',
  author: 'A. Writer',
  publishedAt: '2024-01-15T09:30:00.000Z',
  siteName: 'Example',
  route: 'publisher',
  snapshotAt: null,
  blocks: [
    { type: 'p', text: 'The first paragraph.' },
    { type: 'p', text: 'The second paragraph.' }
  ],
  savedAt: 1700000000000
}

const MISSING = 'never-saved'

// The reader reads the module-level shared store, so without a fresh module
// graph the second test starts on a store an earlier test already loaded and
// the loading state is unobservable.
async function mountReader(slug: string) {
  const { Reader } = await import('./reader')

  return render(<Reader slug={slug} />)
}

beforeEach(async () => {
  vi.resetModules()
  globalThis.indexedDB = new IDBFactory()
  await put(saved)
})

describe('Reader', () => {
  it('renders the saved article whose id the slug encodes', async () => {
    await mountReader(encodeId(saved.id))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'A story' })
    ).toBeDefined()
    expect(screen.getByText('The first paragraph.')).toBeDefined()
    expect(screen.getByText('The second paragraph.')).toBeDefined()
    expect(screen.queryByText(/not in your library/i)).toBeNull()
  })

  it('says nothing about a missing article until the store has read the database', async () => {
    await mountReader(encodeId(MISSING))

    expect(screen.queryByText(/not in your library/i)).toBeNull()

    expect(await screen.findByText(/not in your library/i)).toBeDefined()
  })

  it('links back to the library when the slug is not one of the saved ids', async () => {
    await mountReader(encodeId(MISSING))

    await screen.findByText(/not in your library/i)
    expect(
      screen.getByRole('link', { name: /library/i }).getAttribute('href')
    ).toBe('/paywall-remover')
  })

  it('treats a slug that decodes to nothing like an id that was never saved', async () => {
    await mountReader('!!!')

    await screen.findByText(/not in your library/i)
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(
      screen.getByRole('link', { name: /library/i }).getAttribute('href')
    ).toBe('/paywall-remover')
  })
})
