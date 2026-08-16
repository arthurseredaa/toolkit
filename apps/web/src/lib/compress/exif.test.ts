import exifr from 'exifr'
import { describe, expect, it } from 'vitest'

import { buildExifSegment, insertExif, readCaptureDate } from './exif'

const SOI = new Uint8Array([0xff, 0xd8])
const EOI = new Uint8Array([0xff, 0xd9])
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const DATE = '2024:07:14 18:32:05'

describe('buildExifSegment', () => {
  it('starts with the APP1 marker, a correct length and the Exif header', () => {
    const seg = buildExifSegment({ dateTimeOriginal: DATE })
    expect(Array.from(seg.slice(0, 2))).toEqual([0xff, 0xe1])
    const length = (seg[2] << 8) | seg[3]
    expect(length).toBe(seg.length - 2)
    expect(String.fromCharCode(...seg.slice(4, 10))).toBe('Exif\0\0')
  })

  it('round-trips through exifr with orientation 1', async () => {
    const seg = buildExifSegment({ dateTimeOriginal: DATE })
    const jpeg = concat(SOI, seg, EOI)
    // exifr names 0x9004 `CreateDate` (ExifTool style), and translates
    // Orientation to a label unless translateValues is off.
    const tags = await exifr.parse(jpeg, {
      reviveValues: false,
      translateValues: false,
      pick: ['DateTimeOriginal', 'CreateDate', 'Orientation']
    })
    expect(tags.DateTimeOriginal).toBe(DATE)
    expect(tags.CreateDate).toBe(DATE)
    expect(tags.Orientation).toBe(1)
  })

  it('refuses a malformed date', () => {
    expect(() => buildExifSegment({ dateTimeOriginal: '2024-07-14' })).toThrow()
  })
})

describe('insertExif', () => {
  it('places the segment right after SOI and keeps the rest', () => {
    const rest = new Uint8Array([0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9])
    const seg = buildExifSegment({ dateTimeOriginal: DATE })
    const out = insertExif(concat(SOI, rest), seg)
    expect(Array.from(out.slice(0, 2))).toEqual([0xff, 0xd8])
    expect(Array.from(out.slice(2, 2 + seg.length))).toEqual(Array.from(seg))
    expect(Array.from(out.slice(2 + seg.length))).toEqual(Array.from(rest))
  })

  it('refuses bytes that are not a JPEG', () => {
    const seg = buildExifSegment({ dateTimeOriginal: DATE })
    expect(() =>
      insertExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), seg)
    ).toThrow()
  })
})

describe('readCaptureDate', () => {
  it('returns the raw EXIF string when present', async () => {
    const seg = buildExifSegment({ dateTimeOriginal: DATE })
    const file = new File([concat(SOI, seg, EOI)], 'a.jpg', {
      type: 'image/jpeg'
    })
    expect(await readCaptureDate(file)).toBe(DATE)
  })

  it('returns undefined when there is no EXIF', async () => {
    const file = new File([concat(SOI, EOI)], 'a.jpg', { type: 'image/jpeg' })
    expect(await readCaptureDate(file)).toBeUndefined()
  })

  it('returns undefined for a PNG', async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'b.png', {
      type: 'image/png'
    })
    expect(await readCaptureDate(png)).toBeUndefined()
  })
})
