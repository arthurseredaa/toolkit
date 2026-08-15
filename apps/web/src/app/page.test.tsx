import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Home from './page'

describe('Home', () => {
  it('renders a search field', () => {
    render(<Home />)
    expect(
      screen.getByRole('searchbox', { name: /search tools/i })
    ).toBeDefined()
  })

  it('renders the full tool index', () => {
    render(<Home />)
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })
})
