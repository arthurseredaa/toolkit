import exifr from 'exifr'

const DATE_RE = /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/

const TAG_ORIENTATION = 0x0112
const TAG_EXIF_IFD = 0x8769
const TAG_DATE_ORIGINAL = 0x9003
const TAG_DATE_DIGITIZED = 0x9004
const SHORT = 3
const LONG = 4
const ASCII = 2

const IFD0_OFFSET = 8
const EXIF_IFD_OFFSET = 38
const DATE_OFFSET = 68
const TIFF_LENGTH = 88

/** Minimal EXIF APP1 segment: orientation 1 plus the capture date. */
export function buildExifSegment({
  dateTimeOriginal
}: {
  dateTimeOriginal: string
}): Uint8Array {
  if (!DATE_RE.test(dateTimeOriginal))
    throw new Error(`not an EXIF date: ${dateTimeOriginal}`)

  const tiff = new Uint8Array(TIFF_LENGTH)
  const view = new DataView(tiff.buffer)
  const LE = true

  tiff.set([0x49, 0x49], 0)
  view.setUint16(2, 0x2a, LE)
  view.setUint32(4, IFD0_OFFSET, LE)

  let o = IFD0_OFFSET
  view.setUint16(o, 2, LE)
  o += 2
  o = entry(view, o, TAG_ORIENTATION, SHORT, 1, 1)
  o = entry(view, o, TAG_EXIF_IFD, LONG, 1, EXIF_IFD_OFFSET)
  view.setUint32(o, 0, LE)
  o += 4

  view.setUint16(o, 2, LE)
  o += 2
  o = entry(view, o, TAG_DATE_ORIGINAL, ASCII, 20, DATE_OFFSET)
  o = entry(view, o, TAG_DATE_DIGITIZED, ASCII, 20, DATE_OFFSET)
  view.setUint32(o, 0, LE)
  o += 4

  for (let i = 0; i < 19; i++)
    tiff[DATE_OFFSET + i] = dateTimeOriginal.charCodeAt(i)
  tiff[DATE_OFFSET + 19] = 0

  const header = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00] // "Exif\0\0"
  const length = 2 + header.length + tiff.length
  const seg = new Uint8Array(2 + length)
  seg[0] = 0xff
  seg[1] = 0xe1
  seg[2] = length >> 8
  seg[3] = length & 0xff
  seg.set(header, 4)
  seg.set(tiff, 4 + header.length)
  return seg
}

function entry(
  view: DataView,
  offset: number,
  tag: number,
  type: number,
  count: number,
  value: number
): number {
  view.setUint16(offset, tag, true)
  view.setUint16(offset + 2, type, true)
  view.setUint32(offset + 4, count, true)
  if (type === SHORT) view.setUint16(offset + 8, value, true)
  else view.setUint32(offset + 8, value, true)
  return offset + 12
}

/** Returns a new JPEG with `segment` placed directly after SOI. */
export function insertExif(jpeg: Uint8Array, segment: Uint8Array): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG')
  const out = new Uint8Array(jpeg.length + segment.length)
  out.set(jpeg.subarray(0, 2), 0)
  out.set(segment, 2)
  out.set(jpeg.subarray(2), 2 + segment.length)
  return out
}

/** Raw `YYYY:MM:DD HH:MM:SS` from the source file, or undefined. Never throws. */
export async function readCaptureDate(file: Blob): Promise<string | undefined> {
  if (file.type === 'image/png' || file.type === 'image/webp') return undefined
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const tags = await exifr.parse(bytes, {
      reviveValues: false,
      pick: ['DateTimeOriginal']
    })
    const value: unknown = tags?.DateTimeOriginal
    return typeof value === 'string' && DATE_RE.test(value) ? value : undefined
  } catch {
    return undefined
  }
}
