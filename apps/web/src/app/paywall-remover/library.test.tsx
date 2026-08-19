import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { encodeId } from '@/lib/paywall-remover/ids'
import type { Article, ExtractResult } from '@/lib/paywall-remover/types'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: () => {}, refresh: () => {} })
}))

const TARGET = 'https://example.com/story'

const extracted: Article = {
  id: 'example.com/story',
  url: TARGET,
  title: 'A story',
  author: 'A. Writer',
  publishedAt: '2024-01-15T09:30:00.000Z',
  siteName: 'Example',
  route: 'publisher',
  snapshotAt: null,
  blocks: [{ type: 'p', text: 'The first paragraph.' }],
  savedAt: 1700000000000
}

const fetchMock = vi.fn()

// What the store held at the moment each navigation happened, so ordering is
// an observation rather than an inference from the final state.
const pushes: { path: string; ids: string[] }[] = []

function replyWith(result: ExtractResult) {
  // A fresh Response per call: one Response body cannot be read twice, and the
  // retry test reads it twice.
  fetchMock.mockImplementation(async () => Response.json(result))
}

function requestedUrls(): string[] {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(String(init.body)).url as string
  )
}

// The form reads the module-level shared store, so without a fresh module
// graph a later test starts on a store an earlier test already filled.
async function mountLibrary() {
  const { Library } = await import('./library')
  const { articleStore } = await import('@/lib/paywall-remover/store')
  const store = articleStore()

  push.mockImplementation((path: string) => {
    pushes.push({ path, ids: store.all().map((saved) => saved.id) })
  })

  render(<Library />)
  await screen.findByText(/nothing saved yet/i)

  return { store }
}

async function submit(user: UserEvent, url: string) {
  await user.type(screen.getByRole('textbox', { name: 'Article URL' }), url)
  await user.click(screen.getByRole('button', { name: 'Read' }))
}

beforeEach(() => {
  vi.resetModules()
  globalThis.indexedDB = new IDBFactory()
  push.mockReset()
  fetchMock.mockReset()
  pushes.length = 0
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Library', () => {
  it('posts the submitted URL to the extraction route', async () => {
    replyWith({ ok: true, article: extracted })
    const user = userEvent.setup()
    await mountLibrary()

    await submit(user, TARGET)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(endpoint).toBe('/api/paywall-remover')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ url: TARGET })
  })

  it('saves the extracted article before navigating to its reader route', async () => {
    replyWith({ ok: true, article: extracted })
    const user = userEvent.setup()
    const { store } = await mountLibrary()

    await submit(user, TARGET)

    await vi.waitFor(() => expect(push).toHaveBeenCalledTimes(1))
    expect(pushes).toEqual([
      {
        path: `/paywall-remover/${encodeId(extracted.id)}`,
        ids: [extracted.id]
      }
    ])
    expect(store.all().map((saved) => saved.id)).toEqual([extracted.id])
  })

  it('explains a blocked request and stores nothing', async () => {
    replyWith({ ok: false, reason: 'blocked', url: TARGET })
    const user = userEvent.setup()
    const { store } = await mountLibrary()

    await submit(user, TARGET)

    expect(await screen.findByText(/blocked the request/i)).toBeDefined()
    expect(store.all()).toEqual([])
    expect(push).not.toHaveBeenCalled()
    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    ).toContain(TARGET)
  })

  it('re-issues the request for the same URL when Try again is clicked', async () => {
    replyWith({ ok: false, reason: 'blocked', url: TARGET })
    const user = userEvent.setup()
    await mountLibrary()

    await submit(user, TARGET)
    await screen.findByText(/blocked the request/i)

    await user.click(screen.getByRole('button', { name: 'Try again' }))

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(requestedUrls()).toEqual([TARGET, TARGET])
  })

  it('reports that nothing answered in time when the request never resolves', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    const { store } = await mountLibrary()

    await submit(user, TARGET)

    expect(await screen.findByText(/answered in time/i)).toBeDefined()
    expect(store.all()).toEqual([])
    expect(push).not.toHaveBeenCalled()
  })
})
