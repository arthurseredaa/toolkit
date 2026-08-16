export type OutputType = 'image/jpeg' | 'image/png' | 'image/webp'

export type PresetName = 'smaller' | 'balanced' | 'better'

export type JobStatus = 'queued' | 'working' | 'done' | 'error'

export type CompressResult = {
  blob: Blob
  name: string
  type: OutputType | string
  /** true when the encoded file was not smaller, so the original is returned */
  kept: boolean
  originalSize: number
}

export type Job = {
  id: string
  file: File
  status: JobStatus
  /** per-file override; undefined means "use the batch preset" */
  preset?: PresetName
  result?: CompressResult
  error?: string
}

/** What the UI sends to the worker. */
export type CompressRequest = { file: File; quality: number }

/** What the worker answers. `error` is a message, never an Error (not cloneable). */
export type WorkerReply =
  | { ok: true; value: CompressResult }
  | { ok: false; error: string }
