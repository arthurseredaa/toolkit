import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Compress } from '@/lib/compress/client'
import { zipName } from '@/lib/compress/share'
import type { CompressResult } from '@/lib/compress/types'

import { Compressor } from './compressor'

type Call = {
  file: File
  quality: number
  opts?: { flatten?: boolean }
  resolve: (r: CompressResult) => void
  reject: (e: Error) => void
}

function fakeCompress() {
  const calls: Call[] = []
  const compress: Compress = (file, quality, opts) =>
    new Promise((resolve, reject) => {
      calls.push({ file, quality, opts, resolve, reject })
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

  it('offers Convert to JPEG for a transparent PNG and re-runs it flattened', async () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    const logo = file('logo.png', 1000, 'image/png')
    addFiles([logo])
    await act(async () =>
      calls[0].resolve({
        ...result(logo, 1000),
        type: 'image/png',
        kept: true,
        transparent: true
      })
    )
    expect(screen.getByText('1000 B · kept — transparent PNG')).toBeDefined()

    fireEvent.click(
      screen.getByRole('button', { name: 'Convert logo.png to JPEG' })
    )
    expect(calls).toHaveLength(2)
    expect(calls[1].opts?.flatten).toBe(true)
    expect(screen.getByText('Compressing…')).toBeDefined()

    await act(async () =>
      calls[1].resolve({ ...result(logo, 300), name: 'logo.jpg' })
    )
    expect(screen.getByText('1000 B → 300 B · −70% · logo.jpg')).toBeDefined()
    expect(
      screen.queryByRole('button', { name: 'Convert logo.png to JPEG' })
    ).toBeNull()
  })

  it('packs the finished photos into one zip', async () => {
    const clicks: { name: string; href: string }[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function (this: HTMLAnchorElement) {
        clicks.push({ name: this.download, href: this.href })
      }
    )
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari hasFinePointer />)
    const a = file('a.jpg', 1000)
    const b = file('b.jpg', 2000)
    addFiles([a, b])

    await act(async () => calls[0].resolve(result(a, 250)))
    expect(screen.queryByRole('button', { name: /Download all/ })).toBeNull()

    await act(async () => calls[1].resolve(result(b, 500)))
    fireEvent.click(screen.getByRole('button', { name: 'Download all (2)' }))

    await waitFor(() => expect(clicks).toHaveLength(1))
    expect(clicks[0].name).toBe(zipName())
    expect(clicks[0].href.startsWith('blob:')).toBe(true)
  })
  it('leaves the zip button off a touch device, where sharing wins', async () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari hasFinePointer={false} />)
    const a = file('a.jpg', 1000)
    const b = file('b.jpg', 2000)
    addFiles([a, b])
    await act(async () => {
      calls[0].resolve(result(a, 250))
      calls[1].resolve(result(b, 500))
    })
    expect(screen.queryByRole('button', { name: /Download all/ })).toBeNull()
  })

  it('reports a failed pack instead of leaving the button silent', async () => {
    // The archive is the only application/zip on the page; the row previews
    // need the real thing. Matched by type, not `instanceof Blob` — the zip
    // comes back from undici's Response as a *Node* Blob, so the cross-realm
    // instanceof is false.
    const createObjectURL = URL.createObjectURL
    vi.spyOn(URL, 'createObjectURL').mockImplementation((obj) => {
      if ((obj as Blob).type === 'application/zip')
        throw new Error('out of memory')
      return createObjectURL(obj)
    })
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari hasFinePointer />)
    const a = file('a.jpg', 1000)
    const b = file('b.jpg', 2000)
    addFiles([a, b])
    await act(async () => {
      calls[0].resolve(result(a, 250))
      calls[1].resolve(result(b, 500))
    })

    fireEvent.click(screen.getByRole('button', { name: 'Download all (2)' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('out of memory')
    const button = screen.getByRole('button', { name: 'Download all (2)' })
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it('skips an image type the encoder does not know', () => {
    const { compress } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    addFiles([file('loop.gif', 1000, 'image/gif')])
    expect(
      screen.getByText('Skipped 1 — only JPEG, PNG and WebP are supported.')
    ).toBeDefined()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })
})
