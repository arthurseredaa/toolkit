import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Article, Block } from '@/lib/paywall-remover/types'

import { ArticleBody, groupBlocks } from './article-body'

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'example.com/story',
    url: 'https://example.com/story',
    title: 'A story',
    author: 'A. Writer',
    publishedAt: '2024-01-15T09:30:00.000Z',
    siteName: 'Example',
    route: 'publisher',
    snapshotAt: null,
    blocks: [{ type: 'p', text: 'The first paragraph.' }],
    savedAt: 1700000000000,
    ...overrides
  }
}

const threeItems: Block[] = [
  { type: 'li', text: 'One' },
  { type: 'li', text: 'Two' },
  { type: 'li', text: 'Three' }
]

describe('groupBlocks', () => {
  it('folds consecutive list items into a single list', () => {
    expect(groupBlocks(threeItems)).toEqual([
      { type: 'list', items: ['One', 'Two', 'Three'] }
    ])
  })

  it('starts a second list when a paragraph interrupts the items', () => {
    const blocks: Block[] = [
      { type: 'li', text: 'One' },
      { type: 'li', text: 'Two' },
      { type: 'p', text: 'An aside.' },
      { type: 'li', text: 'Three' }
    ]

    expect(groupBlocks(blocks)).toEqual([
      { type: 'list', items: ['One', 'Two'] },
      { type: 'p', text: 'An aside.' },
      { type: 'list', items: ['Three'] }
    ])
  })
})

describe('ArticleBody', () => {
  it('renders consecutive list items as one list', () => {
    render(<ArticleBody article={article({ blocks: threeItems })} />)

    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(
      ['One', 'Two', 'Three']
    )
  })

  it('shows the title, the author and the published date', () => {
    render(<ArticleBody article={article()} />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'A story' })
    ).toBeDefined()
    expect(screen.getByText('A. Writer')).toBeDefined()
    expect(screen.getByText('2024-01-15')).toBeDefined()
  })

  it('badges a publisher article with the route name alone', () => {
    render(<ArticleBody article={article({ route: 'publisher' })} />)

    expect(screen.getByText('publisher')).toBeDefined()
    expect(screen.queryByText(/archive/)).toBeNull()
  })

  it('badges an archive article with the snapshot date', () => {
    render(
      <ArticleBody
        article={article({ route: 'archive', snapshotAt: '2023-05-01' })}
      />
    )

    expect(screen.getByText(/archive/).textContent).toContain('2023-05-01')
  })

  it('links to the original at the article url', () => {
    render(<ArticleBody article={article()} />)

    expect(
      screen.getByRole('link', { name: /original/ }).getAttribute('href')
    ).toBe('https://example.com/story')
  })
})
