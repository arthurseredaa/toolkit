import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Job } from '@/lib/compress/types'

import { DetailView } from './detail-view'

const original = new File([new Uint8Array(1000)], 'a.jpg', {
  type: 'image/jpeg'
})
const compressed = new Blob([new Uint8Array(250)], { type: 'image/jpeg' })

const done: Job = {
  id: 'job-1',
  file: original,
  status: 'done',
  result: {
    blob: compressed,
    name: 'a.jpg',
    type: 'image/jpeg',
    kept: false,
    originalSize: 1000
  }
}

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) =>
    b === original ? 'blob:original' : 'blob:compressed'
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const noop = () => {}

describe('DetailView', () => {
  it('shows the compressed image and the savings', () => {
    render(
      <DetailView
        job={done}
        batchPreset="balanced"
        onPreset={noop}
        onClose={noop}
      />
    )
    expect(screen.getByRole('img').getAttribute('src')).toBe('blob:compressed')
    expect(screen.getByText(/1000 B → 250 B · −75%/)).toBeDefined()
  })

  it('shows the original while the pointer is held down', () => {
    render(
      <DetailView
        job={done}
        batchPreset="balanced"
        onPreset={noop}
        onClose={noop}
      />
    )
    const img = screen.getByRole('img')
    fireEvent.pointerDown(img)
    expect(screen.getByRole('img').getAttribute('src')).toBe('blob:original')
    fireEvent.pointerUp(img)
    expect(screen.getByRole('img').getAttribute('src')).toBe('blob:compressed')
  })

  it('marks the batch preset active when there is no override', () => {
    render(
      <DetailView
        job={done}
        batchPreset="balanced"
        onPreset={noop}
        onClose={noop}
      />
    )
    expect(
      screen
        .getByRole('button', { name: 'Balanced' })
        .getAttribute('aria-pressed')
    ).toBe('true')
    expect(
      screen
        .getByRole('button', { name: 'Better' })
        .getAttribute('aria-pressed')
    ).toBe('false')
  })

  it('marks the override active and reports a new choice', () => {
    const onPreset = vi.fn()
    render(
      <DetailView
        job={{ ...done, preset: 'smaller' }}
        batchPreset="balanced"
        onPreset={onPreset}
        onClose={noop}
      />
    )
    expect(
      screen
        .getByRole('button', { name: 'Smaller' })
        .getAttribute('aria-pressed')
    ).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Better' }))
    expect(onPreset).toHaveBeenCalledWith('better')
  })

  it('closes on Escape and on the Close button', () => {
    const onClose = vi.fn()
    render(
      <DetailView
        job={done}
        batchPreset="balanced"
        onPreset={noop}
        onClose={onClose}
      />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('says it is compressing while the job is working', () => {
    render(
      <DetailView
        job={{ ...done, status: 'working', result: undefined }}
        batchPreset="balanced"
        onPreset={noop}
        onClose={noop}
      />
    )
    expect(screen.getByText(/Compressing…/)).toBeDefined()
    expect(screen.getByRole('img').getAttribute('src')).toBe('blob:original')
  })
})
