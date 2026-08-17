import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import CompressPage from './page'

describe('CompressPage', () => {
  it('renders the heading, the back link and the picker', () => {
    render(<CompressPage />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Compress' })
    ).toBeDefined()
    expect(
      screen.getByRole('link', { name: /tools/i }).getAttribute('href')
    ).toBe('/')
    expect(screen.getByLabelText('Add photos')).toBeDefined()
  })
})
