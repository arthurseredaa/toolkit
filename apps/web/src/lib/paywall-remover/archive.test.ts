/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { findSnapshot, rawSnapshotUrl, snapshotDate } from './archive'

const fetchMock = vi.fn()

const SNAPSHOT_URL =
  'http://web.archive.org/web/20240115123045/https://example.com/story'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function availability(closest: unknown): Response {
  return jsonResponse({
    url: 'example.com/story',
    archived_snapshots: closest === undefined ? {} : { closest }
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('findSnapshot', () => {
  it('returns the closest snapshot url and timestamp when one is available', async () => {
    fetchMock.mockResolvedValue(
      availability({
        available: true,
        url: SNAPSHOT_URL,
        timestamp: '20240115123045',
        status: '200'
      })
    )

    await expect(findSnapshot('https://example.com/story')).resolves.toEqual({
      url: SNAPSHOT_URL,
      timestamp: '20240115123045'
    })
  })

  it('asks the wayback availability api for the target url', async () => {
    fetchMock.mockResolvedValue(
      availability({
        available: true,
        url: SNAPSHOT_URL,
        timestamp: '20240115123045'
      })
    )

    await findSnapshot('https://example.com/story?id=7')

    const asked = new URL(String(fetchMock.mock.calls[0][0]))
    expect(`${asked.origin}${asked.pathname}`).toBe(
      'https://archive.org/wayback/available'
    )
    expect(asked.searchParams.get('url')).toBe('https://example.com/story?id=7')
  })

  it('returns null when the payload carries no closest snapshot', async () => {
    fetchMock.mockResolvedValue(availability(undefined))

    await expect(findSnapshot('https://example.com/story')).resolves.toBeNull()
  })

  it('returns null when the closest snapshot is not available', async () => {
    fetchMock.mockResolvedValue(
      availability({
        available: false,
        url: SNAPSHOT_URL,
        timestamp: '20240115123045'
      })
    )

    await expect(findSnapshot('https://example.com/story')).resolves.toBeNull()
  })

  it('returns null when the availability api responds 503', async () => {
    fetchMock.mockResolvedValue(
      new Response('upstream unavailable', { status: 503 })
    )

    await expect(findSnapshot('https://example.com/story')).resolves.toBeNull()
  })
})

describe('rawSnapshotUrl', () => {
  it('marks the timestamp segment id_ so wayback returns the original bytes', () => {
    expect(
      rawSnapshotUrl(
        'http://web.archive.org/web/20240101000000/https://example.com/story'
      )
    ).toBe(
      'http://web.archive.org/web/20240101000000id_/https://example.com/story'
    )
  })

  it('leaves a url that is already raw unchanged', () => {
    const raw =
      'http://web.archive.org/web/20240101000000id_/https://example.com/story'

    expect(rawSnapshotUrl(raw)).toBe(raw)
  })
})

describe('snapshotDate', () => {
  it('turns a wayback timestamp into an ISO date', () => {
    expect(snapshotDate('20240115123045')).toBe('2024-01-15')
  })

  it('returns null for anything that is not a wayback timestamp', () => {
    expect(snapshotDate('')).toBeNull()
    expect(snapshotDate('2024')).toBeNull()
    expect(snapshotDate('not-a-timestamp')).toBeNull()
  })
})
