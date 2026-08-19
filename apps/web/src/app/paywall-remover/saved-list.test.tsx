import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { encodeId } from '@/lib/paywall-remover/ids'
import type { Article } from '@/lib/paywall-remover/types'

import { SavedList } from './saved-list'

const newer: Article = {
  id: 'example.com/newer',
  url: 'https://example.com/newer',
  title: 'The newer story',
  author: null,
  publishedAt: null,
  siteName: 'Example',
  route: 'publisher',
  snapshotAt: null,
  blocks: [],
  savedAt: 1700000002000
}

const older: Article = {
  id: 'other.org/older',
  url: 'https://other.org/older',
  title: 'The older story',
  author: null,
  publishedAt: null,
  siteName: 'Other',
  route: 'publisher',
  snapshotAt: null,
  blocks: [],
  savedAt: 1700000001000
}

function noop() {}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SavedList', () => {
  it('lists every saved article newest first, each linking to its reader route', () => {
    render(
      <SavedList articles={[newer, older]} status="ready" onDelete={noop} />
    )

    expect(
      screen.getAllByRole('link').map((link) => link.getAttribute('href'))
    ).toEqual([
      `/paywall-remover/${encodeId(newer.id)}`,
      `/paywall-remover/${encodeId(older.id)}`
    ])
    expect(screen.getByText('The newer story')).toBeDefined()
    expect(screen.getByText('The older story')).toBeDefined()
  })

  it('calls onDelete with the id of the article whose delete button is clicked, without a confirm dialog', async () => {
    const onDelete = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    const user = userEvent.setup()

    render(
      <SavedList articles={[newer, older]} status="ready" onDelete={onDelete} />
    )

    await user.click(
      screen.getByRole('button', { name: 'Delete The older story' })
    )

    expect(onDelete.mock.calls).toEqual([[older.id]])
    expect(confirm).not.toHaveBeenCalled()
  })

  it('offers no controls with the empty sentence once the store is ready and holds nothing', () => {
    render(<SavedList articles={[]} status="ready" onDelete={noop} />)

    expect(screen.getByText(/nothing saved yet/i)).toBeDefined()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByText(/delete/i)).toBeNull()
  })

  it('renders neither the empty sentence nor the list while the store is loading', () => {
    render(
      <SavedList articles={[newer, older]} status="loading" onDelete={noop} />
    )

    expect(screen.queryByText(/nothing saved yet/i)).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByText('The newer story')).toBeNull()
  })

  it('says articles are not kept between visits when storage is unavailable', () => {
    render(<SavedList articles={[]} status="unavailable" onDelete={noop} />)

    expect(
      screen.getByText(/will not let the tool store articles/i)
    ).toBeDefined()
    expect(screen.queryByText(/nothing saved yet/i)).toBeNull()
  })
})
