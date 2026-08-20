import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { archiveTodayUrl, titleFromUrl } from '@/lib/paywall-remover/link'
import type { Article } from '@/lib/paywall-remover/types'

const TARGET = 'https://example.com/2026/a-story-worth-keeping'

// The id differs from the url on purpose: a page that declares a canonical
// comes back under a key the optimistic row could not have known.
const described: Article = {
  id: 'https://example.com/canonical/a-story',
  url: TARGET,
  title: 'A Story Worth Keeping',
  author: 'A. Writer',
  publishedAt: '2024-01-15T09:30:00.000Z',
  siteName: 'Example',
  savedAt: 1700000000000
}

const fetchMock = vi.fn()
const openMock = vi.fn()

// Whether the tab is opened before anything is awaited is the whole point:
// a tab opened after a fetch resolves is a popup, and browsers block it.
const order: string[] = []

function replyWith(article: Article) {
  fetchMock.mockImplementation(async () => {
    order.push('fetch')
    return Response.json({ ok: true, article })
  })
}

// The form reads the module-level shared store, so without a fresh module
// graph a later test starts on a store an earlier test already filled.
async function mountLibrary() {
  const { Library } = await import('./library')
  const { articleStore } = await import('@/lib/paywall-remover/store')
  const store = articleStore()

  render(<Library />)
  await screen.findByText(/nothing saved yet/i)

  return { store }
}

function input(): HTMLInputElement {
  return screen.getByRole('textbox', {
    name: 'Article URL'
  }) as HTMLInputElement
}

async function submit(user: UserEvent, url: string) {
  await user.type(input(), url)
  await user.click(screen.getByRole('button', { name: 'Read' }))
}

beforeEach(() => {
  vi.resetModules()
  globalThis.indexedDB = new IDBFactory()
  fetchMock.mockReset()
  openMock.mockReset()
  openMock.mockImplementation(() => {
    order.push('open')
    return null
  })
  order.length = 0
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('open', openMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Library', () => {
  it('opens the archive copy in a new tab before it asks the server anything', async () => {
    replyWith(described)
    const user = userEvent.setup()
    await mountLibrary()

    await submit(user, TARGET)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(order).toEqual(['open', 'fetch'])
    expect(openMock.mock.calls[0].slice(0, 2)).toEqual([
      archiveTodayUrl(TARGET),
      '_blank'
    ])
  })

  it('posts the normalized url to the describe route', async () => {
    replyWith(described)
    const user = userEvent.setup()
    await mountLibrary()

    await submit(user, `${TARGET}?utm_source=nl`)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [endpoint, init] = fetchMock.mock.calls[0]
    expect(endpoint).toBe('/api/paywall-remover')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ url: TARGET })
  })

  it('replaces the row read off the url with the one the server named', async () => {
    replyWith(described)
    const user = userEvent.setup()
    const { store } = await mountLibrary()

    await submit(user, TARGET)

    await vi.waitFor(() =>
      expect(store.all().map((saved) => saved.title)).toEqual([described.title])
    )
    expect(store.all().map((saved) => saved.id)).toEqual([described.id])
  })

  it('keeps the row named off the url when the request never lands', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    const { store } = await mountLibrary()

    await submit(user, TARGET)

    await vi.waitFor(() => expect(store.all()).toHaveLength(1))
    expect(store.all()[0].title).toBe(titleFromUrl(TARGET))
    expect(openMock).toHaveBeenCalledTimes(1)
  })

  it('clears the input so the next url can be pasted straight in', async () => {
    replyWith(described)
    const user = userEvent.setup()
    await mountLibrary()

    await submit(user, TARGET)

    expect(input().value).toBe('')
  })

  it('says the address is not one it can open, and neither saves nor opens', async () => {
    const user = userEvent.setup()
    const { store } = await mountLibrary()

    await submit(user, 'not a url')

    expect(
      await screen.findByText(/not a URL this tool can open/i)
    ).toBeDefined()
    expect(store.all()).toEqual([])
    expect(openMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
