import type { Job } from './types'

export type Store = {
  all(): Job[]
  add(jobs: Job[]): void
  update(id: string, patch: Partial<Omit<Job, 'id' | 'file'>>): void
  remove(id: string): void
  clear(): void
  subscribe(listener: () => void): () => void
}

let seq = 0

export function createJob(file: File): Job {
  seq += 1
  return { id: `job-${seq}`, file, status: 'queued' }
}

export function createMemoryStore(initial: Job[] = []): Store {
  let jobs: Job[] = initial
  const listeners = new Set<() => void>()

  function set(next: Job[]) {
    jobs = next
    for (const l of listeners) l()
  }

  return {
    all: () => jobs,
    add: (more) => set([...jobs, ...more]),
    update: (id, patch) =>
      set(jobs.map((j) => (j.id === id ? { ...j, ...patch } : j))),
    remove: (id) => set(jobs.filter((j) => j.id !== id)),
    clear: () => set([]),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
