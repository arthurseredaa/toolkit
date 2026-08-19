/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { raceRoutes, type Runners } from './race'
import type { Article, RouteOutcome } from './types'

const TARGET = 'https://example.com/story'

function article(route: Article['route'], title: string): Article {
  return {
    id: TARGET,
    url: TARGET,
    title,
    author: null,
    publishedAt: null,
    siteName: null,
    route,
    snapshotAt: null,
    blocks: [{ type: 'p', text: title }],
    savedAt: 0
  }
}

const PUBLISHER = article('publisher', 'from the publisher')
const ARCHIVE = article('archive', 'from the archive')

const publisherOk: RouteOutcome = { ok: true, article: PUBLISHER }
const archiveOk: RouteOutcome = { ok: true, article: ARCHIVE }

function settleAt(ms: number, outcome: RouteOutcome): Promise<RouteOutcome> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(outcome), ms)
  })
}

/** A route that never finishes on its own, the way a real fetch behaves. */
function stalls(signal: AbortSignal): Promise<RouteOutcome> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('raceRoutes', () => {
  it('returns the publisher article without waiting for the archive', async () => {
    const runners: Runners = {
      publisher: () => settleAt(10, publisherOk),
      archive: stalls
    }

    const result = raceRoutes(TARGET, runners)
    await vi.advanceTimersByTimeAsync(10)

    await expect(result).resolves.toEqual({ ok: true, article: PUBLISHER })
  })

  it('lets a slower archive success win over a fast publisher failure', async () => {
    const runners: Runners = {
      publisher: () => settleAt(10, { ok: false, reason: 'blocked' }),
      archive: () => settleAt(50, archiveOk)
    }

    const result = raceRoutes(TARGET, runners)
    await vi.advanceTimersByTimeAsync(50)

    await expect(result).resolves.toEqual({ ok: true, article: ARCHIVE })
  })

  it('returns the publisher article when both routes succeed', async () => {
    const runners: Runners = {
      publisher: () => settleAt(10, publisherOk),
      archive: () => settleAt(30, archiveOk)
    }

    const result = raceRoutes(TARGET, runners)
    await vi.advanceTimersByTimeAsync(30)

    await expect(result).resolves.toEqual({ ok: true, article: PUBLISHER })
  })

  it('prefers the publisher when the archive result lands at the race first', async () => {
    // One timer settles both routes, so their order is decided by microtask
    // depth alone. The publisher's outcome travels one hop further, which puts
    // the archive at the race first while the publisher is already complete.
    const tick = new Promise<void>((resolve) => {
      setTimeout(resolve, 10)
    })

    const runners: Runners = {
      publisher: () => tick.then(() => publisherOk).then((outcome) => outcome),
      archive: () => tick.then(() => archiveOk)
    }

    const result = raceRoutes(TARGET, runners)
    await vi.advanceTimersByTimeAsync(10)

    await expect(result).resolves.toEqual({ ok: true, article: PUBLISHER })
  })

  it('aborts the signal handed to the losing route once a winner is chosen', async () => {
    let loser: AbortSignal | undefined

    const runners: Runners = {
      publisher: () => settleAt(10, publisherOk),
      archive: (signal) => {
        loser = signal
        return stalls(signal)
      }
    }

    const result = raceRoutes(TARGET, runners)
    await vi.advanceTimersByTimeAsync(10)
    await result

    expect(loser?.aborted).toBe(true)
  })

  it('reports the publisher reason when both routes fail', async () => {
    const runners: Runners = {
      publisher: () => settleAt(10, { ok: false, reason: 'blocked' }),
      archive: () => settleAt(30, { ok: false, reason: 'no-snapshot' })
    }

    const result = raceRoutes(TARGET, runners)
    await vi.advanceTimersByTimeAsync(30)

    await expect(result).resolves.toEqual({
      ok: false,
      reason: 'blocked',
      url: TARGET
    })
  })

  it('reports the archive reason when the publisher only timed out', async () => {
    const runners: Runners = {
      publisher: () => settleAt(10, { ok: false, reason: 'timeout' }),
      archive: () => settleAt(30, { ok: false, reason: 'no-snapshot' })
    }

    const result = raceRoutes(TARGET, runners)
    await vi.advanceTimersByTimeAsync(30)

    await expect(result).resolves.toEqual({
      ok: false,
      reason: 'no-snapshot',
      url: TARGET
    })
  })

  it('times out and aborts both routes once the deadline passes', async () => {
    const seen: AbortSignal[] = []

    const watch = (signal: AbortSignal) => {
      seen.push(signal)
      return stalls(signal)
    }

    const result = raceRoutes(
      TARGET,
      { publisher: watch, archive: watch },
      { deadlineMs: 500 }
    )
    await vi.advanceTimersByTimeAsync(500)

    await expect(result).resolves.toEqual({
      ok: false,
      reason: 'timeout',
      url: TARGET
    })
    expect(seen).toHaveLength(2)
    expect(seen.every((signal) => signal.aborted)).toBe(true)
  })
})
