import { render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useObjectUrl } from './use-object-url'

function Preview({ blob }: { blob: Blob | undefined }) {
  const url = useObjectUrl(blob)
  return <img alt="preview" src={url} />
}

const jpeg = () => new Blob([new Uint8Array(8)], { type: 'image/jpeg' })

describe('useObjectUrl', () => {
  it('leaves the rendered url alive through a StrictMode double mount', () => {
    const revoked: string[] = []
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      revoked.push(url)
    })

    render(
      <StrictMode>
        <Preview blob={jpeg()} />
      </StrictMode>
    )

    const src = screen.getByRole('img').getAttribute('src')
    expect(src).toBeTruthy()
    expect(revoked).not.toContain(src)
  })
})
