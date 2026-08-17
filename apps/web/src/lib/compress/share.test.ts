import { describe, expect, it } from 'vitest'

import { uniqueNames, zipName, zipResults } from './share'
import type { CompressResult } from './types'

const result = (name: string, size: number): CompressResult => ({
  blob: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }),
  name,
  type: 'image/jpeg',
  kept: false,
  originalSize: size * 2
})

describe('uniqueNames', () => {
  it('leaves distinct names alone', () => {
    expect(uniqueNames(['a.jpg', 'b.png'])).toEqual(['a.jpg', 'b.png'])
  })

  it('numbers a repeat before the extension', () => {
    expect(uniqueNames(['a.jpg', 'a.jpg', 'a.jpg'])).toEqual([
      'a.jpg',
      'a (2).jpg',
      'a (3).jpg'
    ])
  })

  it('skips a number the batch already carries', () => {
    expect(uniqueNames(['a.jpg', 'a (2).jpg', 'a.jpg'])).toEqual([
      'a.jpg',
      'a (2).jpg',
      'a (3).jpg'
    ])
  })
})

describe('zipName', () => {
  it('stamps the local day', () => {
    expect(zipName(new Date(2026, 7, 16, 10))).toBe('photos-2026-08-16.zip')
  })
})

describe('zipResults', () => {
  it('packs every result into one archive under unique names', async () => {
    const blob = await zipResults([result('a.jpg', 10), result('a.jpg', 20)])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04])
    // store-only, so the entry names sit in the archive as plain bytes
    expect(new TextDecoder().decode(bytes)).toContain('a (2).jpg')
  })
})
