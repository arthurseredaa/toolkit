import { describe, expect, it } from 'vitest'

import { outputName, planOutput } from './format'

const can = () => true
const cannotWebp = (t: string) => t !== 'image/webp'

describe('planOutput', () => {
  it('keeps JPEG as JPEG', () => {
    expect(
      planOutput({ inputType: 'image/jpeg', hasAlpha: false, canEncode: can })
    ).toBe('image/jpeg')
  })

  it('turns opaque PNG into JPEG', () => {
    expect(
      planOutput({ inputType: 'image/png', hasAlpha: false, canEncode: can })
    ).toBe('image/jpeg')
  })

  it('keeps PNG with alpha as PNG', () => {
    expect(
      planOutput({ inputType: 'image/png', hasAlpha: true, canEncode: can })
    ).toBe('image/png')
  })

  it('keeps WebP when the browser can encode it', () => {
    expect(
      planOutput({ inputType: 'image/webp', hasAlpha: false, canEncode: can })
    ).toBe('image/webp')
  })

  it('falls back from WebP to JPEG (or PNG with alpha) when it cannot', () => {
    expect(
      planOutput({
        inputType: 'image/webp',
        hasAlpha: false,
        canEncode: cannotWebp
      })
    ).toBe('image/jpeg')
    expect(
      planOutput({
        inputType: 'image/webp',
        hasAlpha: true,
        canEncode: cannotWebp
      })
    ).toBe('image/png')
  })

  it('sends anything else to JPEG', () => {
    expect(
      planOutput({ inputType: 'image/heic', hasAlpha: false, canEncode: can })
    ).toBe('image/jpeg')
    expect(planOutput({ inputType: '', hasAlpha: false, canEncode: can })).toBe(
      'image/jpeg'
    )
  })
})

describe('outputName', () => {
  it('keeps the name when the type does not change', () => {
    expect(outputName('IMG_0001.JPEG', 'image/jpeg', 'image/jpeg')).toBe(
      'IMG_0001.JPEG'
    )
  })

  it('swaps the extension when the type changes', () => {
    expect(outputName('shot.png', 'image/png', 'image/jpeg')).toBe('shot.jpg')
    expect(outputName('pic.webp', 'image/webp', 'image/png')).toBe('pic.png')
  })

  it('appends an extension when the name has none', () => {
    expect(outputName('scan', 'image/heic', 'image/jpeg')).toBe('scan.jpg')
  })
})
