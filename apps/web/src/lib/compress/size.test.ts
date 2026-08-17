import { describe, expect, it } from 'vitest'

import { formatBytes, pickSmaller, savingsPercent } from './size'

const blob = (size: number, type = 'image/jpeg') =>
  new Blob([new Uint8Array(size)], { type })

describe('pickSmaller', () => {
  it('returns the candidate when it is smaller', () => {
    const original = blob(100)
    const candidate = blob(40)
    expect(pickSmaller(original, candidate)).toEqual({
      blob: candidate,
      kept: false
    })
    // toEqual compares any two Blobs as equal, so pin the identity too
    expect(pickSmaller(original, candidate).blob).toBe(candidate)
  })

  it('returns the original when the candidate is equal or larger', () => {
    const original = blob(100)
    const same = blob(100)
    const larger = blob(130)
    expect(pickSmaller(original, same)).toEqual({
      blob: original,
      kept: true
    })
    expect(pickSmaller(original, larger)).toEqual({
      blob: original,
      kept: true
    })
    expect(pickSmaller(original, same).blob).toBe(original)
    expect(pickSmaller(original, larger).blob).toBe(original)
  })
})

describe('formatBytes', () => {
  it('formats B, KB and MB with one decimal above KB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(2.4 * 1024 * 1024)).toBe('2.4 MB')
  })
})

describe('savingsPercent', () => {
  it('rounds to a whole percent', () => {
    expect(savingsPercent(1000, 250)).toBe(75)
    expect(savingsPercent(3000, 1000)).toBe(67)
  })

  it('never reports negative savings', () => {
    expect(savingsPercent(100, 100)).toBe(0)
    expect(savingsPercent(100, 120)).toBe(0)
  })

  it('handles a zero-byte original', () => {
    expect(savingsPercent(0, 0)).toBe(0)
  })
})
