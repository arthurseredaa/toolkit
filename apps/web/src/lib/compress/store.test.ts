import { describe, expect, it, vi } from 'vitest'

import { createJob, createMemoryStore } from './store'

const file = (name: string) => new File([], name, { type: 'image/jpeg' })

describe('createJob', () => {
  it('gives every job a unique id and queued status', () => {
    const a = createJob(file('a.jpg'))
    const b = createJob(file('b.jpg'))
    expect(a.id).not.toBe(b.id)
    expect(a.status).toBe('queued')
    expect(a.file.name).toBe('a.jpg')
  })
})

describe('createMemoryStore', () => {
  it('returns the same array until something changes', () => {
    const store = createMemoryStore()
    const first = store.all()
    expect(store.all()).toBe(first)
    store.add([createJob(file('a.jpg'))])
    expect(store.all()).not.toBe(first)
    expect(store.all()).toHaveLength(1)
  })

  it('notifies subscribers once per mutation and stops after unsubscribe', () => {
    const store = createMemoryStore()
    const listener = vi.fn()
    const off = store.subscribe(listener)
    const job = createJob(file('a.jpg'))
    store.add([job])
    store.update(job.id, { status: 'working' })
    store.remove(job.id)
    expect(listener).toHaveBeenCalledTimes(3)
    off()
    store.add([createJob(file('b.jpg'))])
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('merges partial updates into the right job', () => {
    const store = createMemoryStore()
    const a = createJob(file('a.jpg'))
    const b = createJob(file('b.jpg'))
    store.add([a, b])
    store.update(b.id, { status: 'error', error: 'boom' })
    expect(store.all()[0].status).toBe('queued')
    expect(store.all()[1]).toMatchObject({ status: 'error', error: 'boom' })
  })

  it('removes and clears', () => {
    const store = createMemoryStore()
    const a = createJob(file('a.jpg'))
    const b = createJob(file('b.jpg'))
    store.add([a, b])
    store.remove(a.id)
    expect(store.all().map((j) => j.id)).toEqual([b.id])
    store.clear()
    expect(store.all()).toEqual([])
  })
})
