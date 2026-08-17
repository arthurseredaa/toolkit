import type { OutputType } from './types'

/** Decode with EXIF orientation applied, so the pixels are upright. */
export function decode(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

/** Draws the bitmap onto a canvas and closes the bitmap. */
export function draw(bitmap: ImageBitmap): OffscreenCanvas {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('2d context unavailable')
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas
}

/** True if any pixel is not fully opaque. Full scan; ~50 ms for 12 MP. */
export function hasAlpha(canvas: OffscreenCanvas): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true
  return false
}

export async function encode(
  canvas: OffscreenCanvas,
  type: OutputType,
  quality: number
): Promise<Blob> {
  const blob = await canvas.convertToBlob({ type, quality })
  // Safari answers a WebP request with a PNG and no error.
  if (blob.type !== type)
    throw new Error(`browser produced ${blob.type} instead of ${type}`)
  return blob
}

/** Frees the canvas backing store without waiting for GC. */
export function release(canvas: OffscreenCanvas): void {
  canvas.width = 0
  canvas.height = 0
}

let webp: boolean | undefined

/** Probes once whether this browser can encode WebP (Safari cannot). */
export async function canEncodeWebp(): Promise<boolean> {
  if (webp !== undefined) return webp
  const probe = new OffscreenCanvas(1, 1)
  probe.getContext('2d')?.fillRect(0, 0, 1, 1)
  const blob = await probe.convertToBlob({ type: 'image/webp' })
  webp = blob.type === 'image/webp'
  return webp
}
