import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Compress } from '@/lib/compress/client'
import type { CompressResult } from '@/lib/compress/types'

import { Compressor } from './compressor'

type Call = {
  file: File
  quality: number
  resolve: (r: CompressResult) => void
  reject: (e: Error) => void
}

function fakeCompress() {
  const calls: Call[] = []
  const compress: Compress = (file, quality) =>
    new Promise((resolve, reject) => {
      calls.push({ file, quality, resolve, reject })
    })
  return { compress, calls }
}

const file = (name: string, size: number, type = 'image/jpeg') =>
  new File([new Uint8Array(size)], name, { type })

const result = (source: File, size: number): CompressResult => ({
  blob: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }),
  name: source.name,
  type: 'image/jpeg',
  kept: false,
  originalSize: source.size
})

function addFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText('Add photos'), { target: { files } })
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (navigator as { canShare?: unknown }).canShare
  delete (navigator as { share?: unknown }).share
})

describe('Compressor', () => {
  it('adds a row per photo and compresses each with the batch preset', () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    addFiles([file('a.jpg', 1000), file('b.jpg', 2000)])
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(calls.map((c) => [c.file.name, c.quality])).toEqual([
      ['a.jpg', 0.8],
      ['b.jpg', 0.8]
    ])
    expect(screen.getAllByText('Compressing…')).toHaveLength(2)
  })

  it('shows sizes, savings and a download link when a photo is done', async () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    const a = file('a.jpg', 1000)
    addFiles([a])
    await act(async () => calls[0].resolve(result(a, 250)))
    expect(screen.getByText('1000 B → 250 B · −75%')).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'Download' }).getAttribute('download')
    ).toBe('a.jpg')
  })

  it('names the download after the result when the type changed', async () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    const shot = file('shot.png', 1000, 'image/png')
    addFiles([shot])
    await act(async () =>
      calls[0].resolve({ ...result(shot, 250), name: 'shot.jpg' })
    )
    expect(screen.getByText('1000 B → 250 B · −75% · shot.jpg')).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'Download' }).getAttribute('download')
    ).toBe('shot.jpg')
  })

  it('keeps an error on its own row', async () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    const a = file('a.jpg', 1000)
    const b = file('b.jpg', 1000)
    addFiles([a, b])
    await act(async () => {
      calls[0].reject(new Error('decode failed'))
      calls[1].resolve(result(b, 500))
    })
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('decode failed')).toBeDefined()
    expect(within(rows[1]).getByText('1000 B → 500 B · −50%')).toBeDefined()
  })

  it('skips HEIC outside Safari and says so', () => {
    const { compress } = fakeCompress()
    render(<Compressor compress={compress} isSafari={false} />)
    addFiles([file('x.heic', 10, 'image/heic'), file('a.jpg', 10)])
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toMatch(/Skipped 1 HEIC/)
  })

  it('re-encodes non-overridden photos when the batch preset changes', () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    addFiles([file('a.jpg', 1000)])
    const quality = screen.getByRole('group', { name: 'Quality' })
    fireEvent.click(within(quality).getByRole('button', { name: 'Better' }))
    expect(calls).toHaveLength(2)
    expect(calls[1].quality).toBe(0.9)
    expect(
      within(quality)
        .getByRole('button', { name: 'Better' })
        .getAttribute('aria-pressed')
    ).toBe('true')
  })

  it('removes a row', () => {
    const { compress } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    addFiles([file('a.jpg', 1000)])
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.jpg' }))
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('hides Save all when the browser cannot share files', async () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    const a = file('a.jpg', 1000)
    addFiles([a])
    await act(async () => calls[0].resolve(result(a, 250)))
    expect(screen.queryByRole('button', { name: /save all/i })).toBeNull()
  })

  it('shares every finished result from Save all', async () => {
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => true
    })
    const share = vi.fn<(data: ShareData) => Promise<void>>(() =>
      Promise.resolve()
    )
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: share
    })

    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    const a = file('a.jpg', 1000)
    const b = file('b.jpg', 1000)
    addFiles([a, b])
    await act(async () => {
      calls[0].resolve(result(a, 250))
      calls[1].resolve(result(b, 500))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save all (2)' }))
    expect(share).toHaveBeenCalledTimes(1)
    const files = share.mock.calls[0][0].files ?? []
    expect(files.map((f) => [f.name, f.size])).toEqual([
      ['a.jpg', 250],
      ['b.jpg', 500]
    ])
  })
})
