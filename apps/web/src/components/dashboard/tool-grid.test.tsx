import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { setMatchMedia } from '../../../vitest.setup'
import { ToolGrid } from './tool-grid'
import { tools } from './tools'

describe('ToolGrid', () => {
  it('renders one link per tool', () => {
    render(<ToolGrid tools={tools} />)
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })

  it('links each tool to its own route', () => {
    render(<ToolGrid tools={tools} />)
    expect(
      screen.getByRole('link', { name: /compress/i }).getAttribute('href')
    ).toBe('/compress')
    expect(
      screen.getByRole('link', { name: /analytics/i }).getAttribute('href')
    ).toBe('/analytics')
  })

  it('shows the name, description and stat for a tool', () => {
    render(<ToolGrid tools={tools} />)
    expect(screen.getByText('Vinted')).toBeDefined()
    expect(screen.getByText('Listings and profit')).toBeDefined()
    expect(screen.getByText('38 active')).toBeDefined()
  })

  it('still renders every tool when reduced motion is preferred', () => {
    setMatchMedia(true)
    render(<ToolGrid tools={tools} />)
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })
})
