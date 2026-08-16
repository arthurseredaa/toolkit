import { createPool, poolSize } from './pool'
import type { CompressRequest, CompressResult } from './types'

export type Compress = (file: File, quality: number) => Promise<CompressResult>

export function createCompressor(): Compress {
  const pool = createPool<CompressRequest, CompressResult>({
    size: poolSize(navigator.hardwareConcurrency),
    spawn: () =>
      new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  })
  return (file, quality) => pool.run({ file, quality })
}

let shared: Compress | undefined

/**
 * Lazily creates the pool on first use, so importing this module on the server
 * (client components still render there) never touches `Worker`.
 */
export const compressInBrowser: Compress = (file, quality) => {
  shared ??= createCompressor()
  return shared(file, quality)
}
