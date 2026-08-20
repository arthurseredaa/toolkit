/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { assertPublicUrl, isBlockedAddress } from './ssrf'

// The network boundary: the guard must never reach a real resolver in a test.
const lookup = vi.hoisted(() => vi.fn())

vi.mock('node:dns/promises', () => ({ lookup }))

describe('isBlockedAddress', () => {
  it.each([
    ['127.0.0.1', 'IPv4 loopback'],
    ['10.1.2.3', 'RFC1918 10/8'],
    ['192.168.0.1', 'RFC1918 192.168/16'],
    ['172.16.0.1', 'RFC1918 172.16/12'],
    ['169.254.169.254', 'the cloud metadata endpoint'],
    ['100.64.0.1', 'CGNAT'],
    ['::1', 'IPv6 loopback'],
    ['fd00::1', 'IPv6 unique local'],
    ['fe80::1', 'IPv6 link-local'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback']
  ])('blocks %s, %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true)
  })

  it.each([
    ['93.184.216.34', 'a public IPv4 address'],
    ['2606:2800:220:1::1', 'a public IPv6 address']
  ])('allows %s, %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false)
  })
})

describe('assertPublicUrl', () => {
  beforeEach(() => {
    lookup.mockReset()
  })

  it('refuses a file: URL without consulting DNS', async () => {
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(
      'blocked'
    )
    expect(lookup).not.toHaveBeenCalled()
  })

  it('refuses a javascript: URL without consulting DNS', async () => {
    await expect(assertPublicUrl('javascript:alert(1)')).rejects.toThrow(
      'blocked'
    )
    expect(lookup).not.toHaveBeenCalled()
  })

  it('returns the URL when the hostname resolves to a public address', async () => {
    lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])

    const url = await assertPublicUrl('https://example.com/story')

    expect(url).toBeInstanceOf(URL)
    expect(url.href).toBe('https://example.com/story')
    expect(lookup).toHaveBeenCalledWith('example.com', { all: true })
  })

  it('refuses a hostname that resolves to a private address', async () => {
    lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])

    await expect(
      assertPublicUrl('https://internal.example.com')
    ).rejects.toThrow('blocked')
  })

  it('refuses a hostname when only one of several records is private', async () => {
    lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 }
    ])

    await expect(assertPublicUrl('https://rebind.example.com')).rejects.toThrow(
      'blocked'
    )
  })
})
