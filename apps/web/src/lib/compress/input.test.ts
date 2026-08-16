import { describe, expect, it } from 'vitest'

import { ACCEPT, filterFiles, isSafariUA } from './input'

const f = (name: string, type: string) => new File([], name, { type })

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const IOS_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1'

describe('isSafariUA', () => {
  it('is true for iOS Safari', () => {
    expect(isSafariUA(IOS_SAFARI)).toBe(true)
  })

  it('is false for Chrome on macOS and Chrome on iOS', () => {
    expect(isSafariUA(MAC_CHROME)).toBe(false)
    expect(isSafariUA(IOS_CHROME)).toBe(false)
  })
})

describe('filterFiles', () => {
  const heic = f('IMG_1.HEIC', 'image/heic')
  const heifNoMime = f('IMG_2.heif', '')
  const jpg = f('a.jpg', 'image/jpeg')
  const png = f('b.png', 'image/png')
  const pdf = f('doc.pdf', 'application/pdf')

  it('drops HEIC outside Safari and counts it', () => {
    expect(
      filterFiles([heic, heifNoMime, jpg, png], { isSafari: false })
    ).toEqual({
      accepted: [jpg, png],
      skippedHeic: 2
    })
  })

  it('lets HEIC through in Safari', () => {
    expect(filterFiles([heic, jpg], { isSafari: true })).toEqual({
      accepted: [heic, jpg],
      skippedHeic: 0
    })
  })

  it('always drops non-images', () => {
    expect(filterFiles([pdf, jpg], { isSafari: true }).accepted).toEqual([jpg])
  })
})

describe('ACCEPT', () => {
  it('excludes heic outside Safari', () => {
    expect(ACCEPT(false)).toBe('image/jpeg,image/png,image/webp')
    expect(ACCEPT(true)).toBe('image/*')
  })
})
