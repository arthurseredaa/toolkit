/** @see ./plan.md — SSRF trap */
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const V4_BLOCKS: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
]

function toInt(ip: string): number {
  return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0) >>> 0
}

export function isBlockedAddress(address: string): boolean {
  const kind = isIP(address)

  if (kind === 6) {
    const v6 = address.toLowerCase()
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(v6)
    if (mapped) return isBlockedAddress(mapped[1])
    if (v6 === '::1' || v6 === '::') return true
    return /^(fe[89ab]|fc|fd)/.test(v6)
  }

  if (kind !== 4) return true

  const value = toInt(address)
  return V4_BLOCKS.some(([base, bits]) => {
    const mask = (bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0) >>> 0
    return (value & mask) >>> 0 === (toInt(base) & mask) >>> 0
  })
}

export async function assertPublicUrl(input: string | URL): Promise<URL> {
  const url = input instanceof URL ? input : new URL(input)

  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('blocked')

  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true })

  if (addresses.length === 0) throw new Error('blocked')
  for (const { address } of addresses)
    if (isBlockedAddress(address)) throw new Error('blocked')

  return url
}
