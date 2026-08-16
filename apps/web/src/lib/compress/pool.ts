/** The subset of `Worker` the pool needs. Real workers satisfy it as-is. */
export type WorkerLike = {
  postMessage(message: unknown): void
  onmessage: ((ev: MessageEvent) => void) | null
  onerror: ((ev: ErrorEvent) => void) | null
  terminate(): void
}

type Reply<Res> = { ok: true; value: Res } | { ok: false; error: string }

type Task<Req, Res> = {
  req: Req
  resolve: (value: Res) => void
  reject: (error: Error) => void
}

export type Pool<Req, Res> = {
  run(req: Req): Promise<Res>
  terminate(): void
}

export function poolSize(hardwareConcurrency: number | undefined): number {
  return Math.min(Math.max(hardwareConcurrency ?? 2, 2), 4)
}

export function createPool<Req, Res>({
  size,
  spawn
}: {
  size: number
  spawn: () => WorkerLike
}): Pool<Req, Res> {
  const idle: WorkerLike[] = []
  const busy = new Set<WorkerLike>()
  const queue: Task<Req, Res>[] = []
  let terminated = false

  function dispatch() {
    while (queue.length && !terminated) {
      let worker = idle.pop()
      if (!worker) {
        if (busy.size >= size) return
        worker = spawn()
      }
      start(worker, queue.shift()!)
    }
  }

  function start(worker: WorkerLike, task: Task<Req, Res>) {
    busy.add(worker)
    const release = () => {
      busy.delete(worker)
      worker.onmessage = null
      worker.onerror = null
    }
    worker.onmessage = (ev: MessageEvent<Reply<Res>>) => {
      release()
      if (terminated) {
        task.reject(new Error('pool terminated'))
        return
      }
      idle.push(worker)
      if (ev.data.ok) task.resolve(ev.data.value)
      else task.reject(new Error(ev.data.error))
      dispatch()
    }
    worker.onerror = (ev) => {
      release()
      worker.terminate()
      task.reject(new Error(ev.message || 'worker crashed'))
      dispatch()
    }
    worker.postMessage(task.req)
  }

  return {
    run(req) {
      return new Promise<Res>((resolve, reject) => {
        queue.push({ req, resolve, reject })
        dispatch()
      })
    },
    terminate() {
      terminated = true
      for (const w of [...idle, ...busy]) w.terminate()
      idle.length = 0
      for (const t of queue.splice(0)) t.reject(new Error('pool terminated'))
    }
  }
}
