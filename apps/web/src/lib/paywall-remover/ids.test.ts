import { describe, expect, it } from 'vitest'

import { decodeId, encodeId } from './ids'

// Standard base64 of these three covers every character a path segment
// cannot carry: `/` from the first, `+` and `=` from the other two.
const ASCII = 'https://example.com/a/b?x=1'
const NON_ASCII = 'https://exämple.com/ünïcode/路径?q=测试'
const PLUS = 'https://example.com/~a?b=c&d=e'

describe('encodeId', () => {
  it('round-trips an ASCII url through decodeId', () => {
    expect(decodeId(encodeId(ASCII))).toBe(ASCII)
  })

  it('round-trips a url with non-ASCII characters through decodeId', () => {
    expect(decodeId(encodeId(NON_ASCII))).toBe(NON_ASCII)
  })

  it('emits only characters a single path segment can carry', () => {
    for (const id of [ASCII, NON_ASCII, PLUS]) {
      const slug = encodeId(id)

      expect(slug).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(slug).not.toContain('/')
      expect(slug).not.toContain('+')
      expect(slug).not.toContain('=')
    }
  })
})

describe('decodeId', () => {
  it('returns null for a slug that is not base64url', () => {
    expect(decodeId('!!!')).toBeNull()
  })
})
