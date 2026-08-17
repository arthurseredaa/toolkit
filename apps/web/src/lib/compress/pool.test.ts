import { describe, expect, it } from 'vitest'

import { createPool, poolSize, type WorkerLike } from './pool'

function fakeWorker() {
  const w = {
    posted: [] as unknown[],
    terminated: false,
    onmessage: null as WorkerLike['onmessage'],
    onerror: null as WorkerLike['onerror'],
    postMessage(message: unknown) {
      w.posted.push(message)
    },
    terminate() {
      w.terminated = true
    },
    reply(value: unknown) {
      w.onmessage?.(new MessageEvent('message', { data: { ok: true, value } }))
    },
    fail(error: string) {
      w.onmessage?.(new MessageEvent('message', { data: { ok: false, error } }))
    },
    crash() {
      w.onerror?.(new ErrorEvent('error', { message: 'boom' }))
    }
  }
  return w
}

function setup(size: number) {
  const workers: ReturnType<typeof fakeWorker>[] = []
  const pool = createPool<number, string>({
    size,
    spawn: () => {
      const w = fakeWorker()
      workers.push(w)
      return w
    }
  })
  return { pool, workers }
}

describe('createPool', () => {
  it('spawns at most `size` workers and queues the rest in order', async () => {
    const { pool, workers } = setup(2)
    const p1 = pool.run(1)
    const p2 = pool.run(2)
    const p3 = pool.run(3)
    expect(workers).toHaveLength(2)
    expect(workers[0].posted).toEqual([1])
    expect(workers[1].posted).toEqual([2])

    workers[0].reply('one')
    expect(await p1).toBe('one')
    expect(workers).toHaveLength(2)
    expect(workers[0].posted).toEqual([1, 3])

    workers[1].reply('two')
    workers[0].reply('three')
    expect(await p2).toBe('two')
    expect(await p3).toBe('three')
  })

  it('rejects only the failed request and reuses the worker', async () => {
    const { pool, workers } = setup(1)
    const p1 = pool.run(1)
    const p2 = pool.run(2)
    workers[0].fail('decode failed')
    await expect(p1).rejects.toThrow('decode failed')
    expect(workers).toHaveLength(1)
    expect(workers[0].posted).toEqual([1, 2])
    workers[0].reply('two')
    expect(await p2).toBe('two')
  })

  it('replaces a crashed worker', async () => {
    const { pool, workers } = setup(1)
    const p1 = pool.run(1)
    workers[0].crash()
    await expect(p1).rejects.toThrow('boom')
    expect(workers[0].terminated).toBe(true)
    const p2 = pool.run(2)
    expect(workers).toHaveLength(2)
    workers[1].reply('two')
    expect(await p2).toBe('two')
  })

  it('terminate() stops every worker and rejects the queue', async () => {
    const { pool, workers } = setup(1)
    const p1 = pool.run(1)
    const p2 = pool.run(2)
    pool.terminate()
    expect(workers[0].terminated).toBe(true)
    await expect(p2).rejects.toThrow('terminated')
    workers[0].reply('late')
    await expect(p1).rejects.toThrow('terminated')
  })
})

describe('poolSize', () => {
  it('clamps hardwareConcurrency into [2, 4]', () => {
    expect(poolSize(undefined)).toBe(2)
    expect(poolSize(1)).toBe(2)
    expect(poolSize(3)).toBe(3)
    expect(poolSize(10)).toBe(4)
  })
})
