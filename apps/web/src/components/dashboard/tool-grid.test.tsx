import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { setMatchMedia } from '../../../vitest.setup'
import { ToolGrid } from './tool-grid'
import { tools } from './tools'

// Assertions are derived from `tools`, not copied out of it. The grid's
// contract is "one link per entry, each pointing at its own slug" — pinning
// a particular tool tests the data instead, and breaks the whole suite the
// next time the dashboard line-up changes.
describe('ToolGrid', () => {
  it('renders one link per tool', () => {
    render(<ToolGrid tools={tools} />)
    expect(screen.getAllByRole('link')).toHaveLength(tools.length)
  })

  it('links each tool to its own route, in order', () => {
    render(<ToolGrid tools={tools} />)
    expect(
      screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    ).toEqual(tools.map((t) => `/${t.slug}`))
  })

  it('shows the name, description and stat for a tool', () => {
    const tool = tools[0]
    render(<ToolGrid tools={tools} />)
    expect(screen.getByText(tool.name)).toBeDefined()
    expect(screen.getByText(tool.description)).toBeDefined()
    expect(screen.getByText(tool.stat)).toBeDefined()
  })

  it('still renders every tool when reduced motion is preferred', () => {
    setMatchMedia(true)
    render(<ToolGrid tools={tools} />)
    expect(screen.getAllByRole('link')).toHaveLength(tools.length)
  })
})
