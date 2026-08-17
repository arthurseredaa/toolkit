import {
  canEncodeWebp,
  decode,
  draw,
  encode,
  hasAlpha,
  release
} from './encode'
import { buildExifSegment, insertExif, readCaptureDate } from './exif'
import { outputName, planOutput } from './format'
import { pickSmaller } from './size'
import type { CompressRequest, CompressResult, WorkerReply } from './types'

async function compress({
  file,
  quality,
  flatten
}: CompressRequest): Promise<CompressResult> {
  const canvas = draw(await decode(file))
  try {
    const webp = await canEncodeWebp()
    const alpha =
      !flatten &&
      (file.type === 'image/png' || file.type === 'image/webp') &&
      hasAlpha(canvas)
    const type = planOutput({
      inputType: file.type,
      hasAlpha: alpha,
      canEncode: (t) => t !== 'image/webp' || webp
    })

    let encoded = await encode(canvas, type, quality)

    if (type === 'image/jpeg') {
      const date = await readCaptureDate(file)
      if (date) {
        const bytes = new Uint8Array(await encoded.arrayBuffer())
        const withExif = insertExif(
          bytes,
          buildExifSegment({ dateTimeOriginal: date })
        )
        encoded = new Blob([new Uint8Array(withExif)], { type })
      }
    }

    const { blob, kept } = pickSmaller<Blob>(file, encoded)
    return {
      blob,
      name: kept ? file.name : outputName(file.name, file.type, type),
      type: kept ? file.type : type,
      kept,
      originalSize: file.size,
      transparent: alpha && type === 'image/png'
    }
  } finally {
    release(canvas)
  }
}

self.onmessage = async (ev: MessageEvent<CompressRequest>) => {
  let reply: WorkerReply
  try {
    reply = { ok: true, value: await compress(ev.data) }
  } catch (e) {
    reply = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  self.postMessage(reply)
}
