Decisions: ./plan.md

# Compress — steps

Run from the repo root. Requires the design-system plans to be landed (they are).
**Commit after each task** as `feat(web): <what>` / `test(web): <what>` /
`chore(web): <what>`. Not repeated below.

Files, by where they live:

| Path | Owns |
|---|---|
| `apps/web/src/lib/compress/types.ts` | shared types |
| `apps/web/src/lib/compress/presets.ts` | the three quality presets |
| `apps/web/src/lib/compress/format.ts` | which output type a file gets, and its file name |
| `apps/web/src/lib/compress/size.ts` | "never larger than input", byte formatting |
| `apps/web/src/lib/compress/input.ts` | picker filtering (`.heic` outside Safari) |
| `apps/web/src/lib/compress/exif.ts` | minimal EXIF APP1 writer + insert into a JPEG |
| `apps/web/src/lib/compress/store.ts` | in-memory job store behind the `Store` interface |
| `apps/web/src/lib/compress/pool.ts` | worker pool / queue, worker-agnostic |
| `apps/web/src/lib/compress/encode.ts` | Canvas decode/encode — the swappable encoder |
| `apps/web/src/lib/compress/worker.ts` | the Web Worker entry: one file in, one result out |
| `apps/web/src/lib/compress/client.ts` | wires real workers to the pool, exposes `compress()` |
| `apps/web/src/lib/compress/share.ts` | Web Share + per-file download |
| `apps/web/src/app/compress/use-object-url.ts` | one object URL per blob, revoked on change |
| `apps/web/src/app/compress/detail-view.tsx` | full-screen result, hold-to-compare, per-file preset |
| `apps/web/src/app/compress/compressor.tsx` | the client island: input, rows, save all |
| `apps/web/src/app/compress/page.tsx` | server page |

Only `worker.ts`, `encode.ts`, `client.ts`, `share.ts` touch browser-only APIs.
Everything else is pure and unit-tested. jsdom has no `OffscreenCanvas`,
`Worker`, `createImageBitmap` or `navigator.share` — do not try to test those
four files there; the plan's Verification table covers them on a device.

---

## Task 1 — Prep: button primitive, card text, jsdom stubs

**Agent:** worker

**Modifies:** `apps/web/src/components/dashboard/tools.ts`,
`apps/web/src/components/dashboard/tool-grid.test.tsx` (only if it asserts the
old description), `apps/web/vitest.setup.ts`
**Creates:** `apps/web/src/components/ui/button.tsx` (generated)

No test of its own — generated code plus a string change already covered by
`tool-grid.test.tsx`.

- [x] **1.1** `cd apps/web && pnpm dlx shadcn@latest add button -y`
      Then from the root `pnpm fmt` — the CLI writes double quotes and
      semicolons. Expect `button.tsx` with variants `default | outline |
      secondary | ghost | destructive | link` and sizes `xs | sm | default | lg |
      icon`. `class-variance-authority` lands in `apps/web/package.json`
      dependencies; leave it there. `shadcn` updates the **root** lockfile.

- [x] **1.2** `tools.ts` — the compress entry:

```ts
  {
    slug: 'compress',
    name: 'Compress',
    description: 'Batch lossy compression',
    stat: '1.2k processed'
  },
```

- [x] **1.3** `pnpm -F web test tool-grid` → passes (the test asserts the Vinted
      row, not this one; if it does assert `Batch resize and convert`, update the
      string there too).

- [x] **1.4** Append to `apps/web/vitest.setup.ts` — jsdom has no object URLs and
      the compress components create them on every row:

```ts
if (typeof URL.createObjectURL !== 'function') {
  let n = 0
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    configurable: true,
    value: () => `blob:jsdom/${n++}`
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    configurable: true,
    value: () => {}
  })
}
```

- [x] **1.5** `pnpm -F web test` → still green; `pnpm -F web typecheck` → clean.

---

## Task 2 — Types and presets

**Agent:** worker

**Creates:** `apps/web/src/lib/compress/types.ts`,
`apps/web/src/lib/compress/presets.ts`

No test — static literals. Every later test imports them, so a typo fails there.

- [x] **2.1** `types.ts`:

```ts
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
```

- [x] **2.2** `presets.ts`:

```ts
import type { PresetName } from './types'

export const PRESETS: Record<PresetName, { label: string; quality: number }> = {
  smaller: { label: 'Smaller', quality: 0.6 },
  balanced: { label: 'Balanced', quality: 0.8 },
  better: { label: 'Better', quality: 0.9 }
}

export const PRESET_ORDER: PresetName[] = ['smaller', 'balanced', 'better']

export const DEFAULT_PRESET: PresetName = 'balanced'
```

- [x] **2.3** `pnpm -F web typecheck` → clean.

---

## Task 3 — Output format policy

**Agent:** tdd -> worker

**Creates:** `apps/web/src/lib/compress/format.ts` + `format.test.ts`

**The test that proves it:** JPEG stays JPEG; opaque PNG becomes JPEG and its
name gets `.jpg`; PNG with alpha stays PNG; WebP stays WebP only where the
browser can encode it, else JPEG; anything else (HEIC on Safari) becomes JPEG.

- [x] **3.1** Write the failing test — `format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { outputName, planOutput } from './format'

const can = () => true
const cannotWebp = (t: string) => t !== 'image/webp'

describe('planOutput', () => {
  it('keeps JPEG as JPEG', () => {
    expect(
      planOutput({ inputType: 'image/jpeg', hasAlpha: false, canEncode: can })
    ).toBe('image/jpeg')
  })

  it('turns opaque PNG into JPEG', () => {
    expect(
      planOutput({ inputType: 'image/png', hasAlpha: false, canEncode: can })
    ).toBe('image/jpeg')
  })

  it('keeps PNG with alpha as PNG', () => {
    expect(
      planOutput({ inputType: 'image/png', hasAlpha: true, canEncode: can })
    ).toBe('image/png')
  })

  it('keeps WebP when the browser can encode it', () => {
    expect(
      planOutput({ inputType: 'image/webp', hasAlpha: false, canEncode: can })
    ).toBe('image/webp')
  })

  it('falls back from WebP to JPEG (or PNG with alpha) when it cannot', () => {
    expect(
      planOutput({
        inputType: 'image/webp',
        hasAlpha: false,
        canEncode: cannotWebp
      })
    ).toBe('image/jpeg')
    expect(
      planOutput({
        inputType: 'image/webp',
        hasAlpha: true,
        canEncode: cannotWebp
      })
    ).toBe('image/png')
  })

  it('sends anything else to JPEG', () => {
    expect(
      planOutput({ inputType: 'image/heic', hasAlpha: false, canEncode: can })
    ).toBe('image/jpeg')
    expect(planOutput({ inputType: '', hasAlpha: false, canEncode: can })).toBe(
      'image/jpeg'
    )
  })
})

describe('outputName', () => {
  it('keeps the name when the type does not change', () => {
    expect(outputName('IMG_0001.JPEG', 'image/jpeg', 'image/jpeg')).toBe(
      'IMG_0001.JPEG'
    )
  })

  it('swaps the extension when the type changes', () => {
    expect(outputName('shot.png', 'image/png', 'image/jpeg')).toBe('shot.jpg')
    expect(outputName('pic.webp', 'image/webp', 'image/png')).toBe('pic.png')
  })

  it('appends an extension when the name has none', () => {
    expect(outputName('scan', 'image/heic', 'image/jpeg')).toBe('scan.jpg')
  })
})
```

- [x] **3.2** `pnpm -F web test format` → FAIL, cannot resolve `./format`

- [x] **3.3** `format.ts`:

```ts
import type { OutputType } from './types'

export type PlanInput = {
  inputType: string
  hasAlpha: boolean
  canEncode: (type: OutputType) => boolean
}

export function planOutput({
  inputType,
  hasAlpha,
  canEncode
}: PlanInput): OutputType {
  if (inputType === 'image/jpeg') return 'image/jpeg'
  if (inputType === 'image/png') return hasAlpha ? 'image/png' : 'image/jpeg'
  if (inputType === 'image/webp') {
    if (canEncode('image/webp')) return 'image/webp'
    return hasAlpha ? 'image/png' : 'image/jpeg'
  }
  return 'image/jpeg'
}

const EXT: Record<OutputType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
}

export function outputName(
  name: string,
  inputType: string,
  outputType: OutputType
): string {
  if (inputType === outputType) return name
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  return `${stem}.${EXT[outputType]}`
}
```

- [x] **3.4** `pnpm -F web test format` → 9 passed

---

## Task 4 — Size rule and formatting

**Agent:** tdd -> worker

**Creates:** `apps/web/src/lib/compress/size.ts` + `size.test.ts`

**The test that proves it:** a result that is not strictly smaller is replaced
by the original and flagged `kept`; bytes format as `2.4 MB`; savings are a
whole percent and never negative.

- [x] **4.1** Write the failing test — `size.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { formatBytes, pickSmaller, savingsPercent } from './size'

const blob = (size: number, type = 'image/jpeg') =>
  new Blob([new Uint8Array(size)], { type })

describe('pickSmaller', () => {
  it('returns the candidate when it is smaller', () => {
    const original = blob(100)
    const candidate = blob(40)
    expect(pickSmaller(original, candidate)).toEqual({
      blob: candidate,
      kept: false
    })
  })

  it('returns the original when the candidate is equal or larger', () => {
    const original = blob(100)
    expect(pickSmaller(original, blob(100))).toEqual({
      blob: original,
      kept: true
    })
    expect(pickSmaller(original, blob(130))).toEqual({
      blob: original,
      kept: true
    })
  })
})

describe('formatBytes', () => {
  it('formats B, KB and MB with one decimal above KB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(2.4 * 1024 * 1024)).toBe('2.4 MB')
  })
})

describe('savingsPercent', () => {
  it('rounds to a whole percent', () => {
    expect(savingsPercent(1000, 250)).toBe(75)
    expect(savingsPercent(3000, 1000)).toBe(67)
  })

  it('never reports negative savings', () => {
    expect(savingsPercent(100, 100)).toBe(0)
    expect(savingsPercent(100, 120)).toBe(0)
  })

  it('handles a zero-byte original', () => {
    expect(savingsPercent(0, 0)).toBe(0)
  })
})
```

- [x] **4.2** `pnpm -F web test size` → FAIL, cannot resolve `./size`

- [x] **4.3** `size.ts`:

```ts
export function pickSmaller<T extends Blob>(
  original: T,
  candidate: T
): { blob: T; kept: boolean } {
  if (candidate.size < original.size) return { blob: candidate, kept: false }
  return { blob: original, kept: true }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

export function savingsPercent(before: number, after: number): number {
  if (before <= 0 || after >= before) return 0
  return Math.round(((before - after) / before) * 100)
}
```

- [x] **4.4** `pnpm -F web test size` → 6 passed

---

## Task 5 — Picker filtering

**Agent:** tdd -> worker

**Creates:** `apps/web/src/lib/compress/input.ts` + `input.test.ts`

**The test that proves it:** outside Safari `.heic`/`.heif` files (by extension
or MIME) are dropped and counted; in Safari they pass; non-image files are
always dropped; the Safari detector says no to Chrome-on-Mac and yes to iOS
Safari.

- [x] **5.1** Write the failing test — `input.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { ACCEPT, filterFiles, isSafariUA } from './input'

const f = (name: string, type: string) => new File([], name, { type })

const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const IOS_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1'

describe('isSafariUA', () => {
  it('is true for iOS Safari', () => {
    expect(isSafariUA(IOS_SAFARI)).toBe(true)
  })

  it('is false for Chrome on macOS and Chrome on iOS', () => {
    expect(isSafariUA(MAC_CHROME)).toBe(false)
    expect(isSafariUA(IOS_CHROME)).toBe(false)
  })
})

describe('filterFiles', () => {
  const heic = f('IMG_1.HEIC', 'image/heic')
  const heifNoMime = f('IMG_2.heif', '')
  const jpg = f('a.jpg', 'image/jpeg')
  const png = f('b.png', 'image/png')
  const pdf = f('doc.pdf', 'application/pdf')

  it('drops HEIC outside Safari and counts it', () => {
    expect(filterFiles([heic, heifNoMime, jpg, png], { isSafari: false })).toEqual({
      accepted: [jpg, png],
      skippedHeic: 2
    })
  })

  it('lets HEIC through in Safari', () => {
    expect(filterFiles([heic, jpg], { isSafari: true })).toEqual({
      accepted: [heic, jpg],
      skippedHeic: 0
    })
  })

  it('always drops non-images', () => {
    expect(filterFiles([pdf, jpg], { isSafari: true }).accepted).toEqual([jpg])
  })
})

describe('ACCEPT', () => {
  it('excludes heic outside Safari', () => {
    expect(ACCEPT(false)).toBe('image/jpeg,image/png,image/webp')
    expect(ACCEPT(true)).toBe('image/*')
  })
})
```

- [x] **5.2** `pnpm -F web test input` → FAIL, cannot resolve `./input`

- [x] **5.3** `input.ts`:

```ts
const HEIC_RE = /\.hei[cf]$/i

export function isSafariUA(ua: string): boolean {
  return /Safari\//.test(ua) && !/Chrome|CriOS|Chromium|Edg|OPR|FxiOS/.test(ua)
}

export function isHeic(file: File): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    HEIC_RE.test(file.name)
  )
}

/** `accept` for the file input. A hint to the picker, not enforcement — see filterFiles. */
export function ACCEPT(isSafari: boolean): string {
  return isSafari ? 'image/*' : 'image/jpeg,image/png,image/webp'
}

export function filterFiles(
  files: Iterable<File>,
  { isSafari }: { isSafari: boolean }
): { accepted: File[]; skippedHeic: number } {
  const accepted: File[] = []
  let skippedHeic = 0
  for (const file of files) {
    if (isHeic(file)) {
      if (isSafari) accepted.push(file)
      else skippedHeic++
      continue
    }
    if (file.type.startsWith('image/')) accepted.push(file)
  }
  return { accepted, skippedHeic }
}
```

- [x] **5.4** `pnpm -F web test input` → 6 passed

---

## Task 6 — EXIF: capture date in, minimal APP1 out

**Agent:** tdd -> worker

**Creates:** `apps/web/src/lib/compress/exif.ts` + `exif.test.ts`
**Modifies:** `apps/web/package.json` (adds `exifr`)

**The test that proves it:** the segment we build is a valid APP1 that `exifr`
itself parses back to the same `DateTimeOriginal` and `Orientation = 1`;
inserting it after SOI keeps the rest of the JPEG intact; a non-JPEG is refused;
`readCaptureDate` returns the raw `YYYY:MM:DD HH:MM:SS` string or `undefined`.

- [x] **6.1** `pnpm -F web add exifr` — 7.1.x. Import from `'exifr'` (the full
      ESM build). It has no `exports` map and types only for the root import, so
      `exifr/dist/lite.esm.mjs` would type-check as `any` — not worth a shim.

- [x] **6.2** Write the failing test — `exif.test.ts`:

```ts
import exifr from 'exifr'
import { describe, expect, it } from 'vitest'

import { buildExifSegment, insertExif, readCaptureDate } from './exif'

const SOI = new Uint8Array([0xff, 0xd8])
const EOI = new Uint8Array([0xff, 0xd9])
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

const DATE = '2024:07:14 18:32:05'

describe('buildExifSegment', () => {
  it('starts with the APP1 marker, a correct length and the Exif header', () => {
    const seg = buildExifSegment({ dateTimeOriginal: DATE })
    expect(Array.from(seg.slice(0, 2))).toEqual([0xff, 0xe1])
    const length = (seg[2] << 8) | seg[3]
    expect(length).toBe(seg.length - 2)
    expect(String.fromCharCode(...seg.slice(4, 10))).toBe('Exif\0\0')
  })

  it('round-trips through exifr with orientation 1', async () => {
    const seg = buildExifSegment({ dateTimeOriginal: DATE })
    const jpeg = concat(SOI, seg, EOI)
    // exifr names 0x9004 `CreateDate` (ExifTool style), and translates
    // Orientation to a label unless translateValues is off.
    const tags = await exifr.parse(jpeg, {
      reviveValues: false,
      translateValues: false,
      pick: ['DateTimeOriginal', 'CreateDate', 'Orientation']
    })
    expect(tags.DateTimeOriginal).toBe(DATE)
    expect(tags.CreateDate).toBe(DATE)
    expect(tags.Orientation).toBe(1)
  })

  it('refuses a malformed date', () => {
    expect(() => buildExifSegment({ dateTimeOriginal: '2024-07-14' })).toThrow()
  })
})

describe('insertExif', () => {
  it('places the segment right after SOI and keeps the rest', () => {
    const rest = new Uint8Array([0xff, 0xdb, 0x00, 0x02, 0xff, 0xd9])
    const seg = buildExifSegment({ dateTimeOriginal: DATE })
    const out = insertExif(concat(SOI, rest), seg)
    expect(Array.from(out.slice(0, 2))).toEqual([0xff, 0xd8])
    expect(Array.from(out.slice(2, 2 + seg.length))).toEqual(Array.from(seg))
    expect(Array.from(out.slice(2 + seg.length))).toEqual(Array.from(rest))
  })

  it('refuses bytes that are not a JPEG', () => {
    const seg = buildExifSegment({ dateTimeOriginal: DATE })
    expect(() => insertExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), seg)).toThrow()
  })
})

describe('readCaptureDate', () => {
  it('returns the raw EXIF string when present', async () => {
    const seg = buildExifSegment({ dateTimeOriginal: DATE })
    const file = new File([concat(SOI, seg, EOI)], 'a.jpg', {
      type: 'image/jpeg'
    })
    expect(await readCaptureDate(file)).toBe(DATE)
  })

  it('returns undefined when there is no EXIF', async () => {
    const file = new File([concat(SOI, EOI)], 'a.jpg', { type: 'image/jpeg' })
    expect(await readCaptureDate(file)).toBeUndefined()
  })

  it('returns undefined for a PNG', async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'b.png', {
      type: 'image/png'
    })
    expect(await readCaptureDate(png)).toBeUndefined()
  })
})
```

- [x] **6.3** `pnpm -F web test exif` → FAIL, cannot resolve `./exif`

- [x] **6.4** `exif.ts`. Layout is fixed and little-endian; offsets are relative to
      the TIFF header, which is where EXIF offsets point:

```
0   "II" 2A00 08000000              TIFF header, IFD0 at 8
8   IFD0: 2 entries                 Orientation=1, ExifIFDPointer→38, next=0
38  ExifIFD: 2 entries              DateTimeOriginal→68, DateTimeDigitized→68, next=0
68  "YYYY:MM:DD HH:MM:SS\0"         20 bytes ASCII
88  end
```

```ts
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

  for (let i = 0; i < 19; i++) tiff[DATE_OFFSET + i] = dateTimeOriginal.charCodeAt(i)
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
```

- [x] **6.5** `pnpm -F web test exif` → 8 passed. If the round-trip test fails
      with exifr complaining about an unknown segment or an unexpected end of
      file, the fault is in the fixture, not the writer — the fixture is
      `SOI + APP1 + EOI` and exifr stops scanning at EOI.

---

## Task 7 — In-memory job store

**Agent:** tdd -> worker

**Creates:** `apps/web/src/lib/compress/store.ts` + `store.test.ts`

**The test that proves it:** `all()` is referentially stable until a mutation
(so `useSyncExternalStore` does not re-render in a loop), every mutation
notifies subscribers once, `update` merges a partial, `remove` and `clear`
work, and `createJob` gives unique ids.

- [x] **7.1** Write the failing test — `store.test.ts`:

```ts
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
```

- [x] **7.2** `pnpm -F web test store` → FAIL, cannot resolve `./store`

- [x] **7.3** `store.ts`:

```ts
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
```

- [x] **7.4** `pnpm -F web test store` → 5 passed

---

## Task 8 — Worker pool

**Agent:** tdd -> worker

**Creates:** `apps/web/src/lib/compress/pool.ts` + `pool.test.ts`

**The test that proves it:** with `size: 2` and three requests, only two workers
are spawned and the third request is posted to the first worker that replies;
a `{ ok: false }` reply rejects only its own request and the worker is reused;
a worker `onerror` rejects the request, terminates that worker and a fresh one
is spawned for the next request; `terminate()` terminates every worker and
rejects what is still queued; `poolSize` clamps to `[2, 4]`.

- [x] **8.1** Write the failing test — `pool.test.ts`:

```ts
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
```

- [x] **8.2** `pnpm -F web test pool` → FAIL, cannot resolve `./pool`

- [x] **8.3** `pool.ts`:

```ts
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
```

- [x] **8.4** `pnpm -F web test pool` → 5 passed

---

## Task 9 — Encoder, worker entry, client wiring

**Agent:** worker

**Creates:** `apps/web/src/lib/compress/encode.ts`,
`apps/web/src/lib/compress/worker.ts`, `apps/web/src/lib/compress/client.ts`

**The test that proves it:** none in vitest — every line here touches
`createImageBitmap`, `OffscreenCanvas` or `Worker`, which jsdom lacks. Proven by
the on-device rows of the Verification table in `./plan.md`; the policy these
files call (`planOutput`, `pickSmaller`, `insertExif`, `createPool`) is already
tested. Type-check is the gate for this task.

- [x] **9.1** `encode.ts` — the swappable encoder. Anything that replaces the
      native codec later replaces this file only:

```ts
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
```

- [x] **9.2** `worker.ts` — one request in, one reply out. `File` in and `Blob`
      out are cloned by reference by the structured clone algorithm; nothing
      here needs a transfer list. Never post an `ImageBitmap` or a raw buffer:

```ts
import { canEncodeWebp, decode, draw, encode, hasAlpha, release } from './encode'
import { buildExifSegment, insertExif, readCaptureDate } from './exif'
import { outputName, planOutput } from './format'
import { pickSmaller } from './size'
import type { CompressRequest, CompressResult, WorkerReply } from './types'

async function compress({ file, quality }: CompressRequest): Promise<CompressResult> {
  const canvas = draw(await decode(file))
  try {
    const webp = await canEncodeWebp()
    const alpha =
      (file.type === 'image/png' || file.type === 'image/webp') && hasAlpha(canvas)
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
        encoded = new Blob(
          [insertExif(bytes, buildExifSegment({ dateTimeOriginal: date }))],
          { type }
        )
      }
    }

    const { blob, kept } = pickSmaller<Blob>(file, encoded)
    return {
      blob,
      name: kept ? file.name : outputName(file.name, file.type, type),
      type: kept ? file.type : type,
      kept,
      originalSize: file.size
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
```

- [x] **9.3** `client.ts` — the only place a real `Worker` is constructed.
      Turbopack bundles `new Worker(new URL('./worker.ts', import.meta.url))`
      as a separate entry; the `type: 'module'` option is required because
      `worker.ts` uses `import`:

```ts
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
```

- [x] **9.4** `pnpm -F web typecheck` → clean. `pnpm lint` → clean.

---

## Task 10 — Share and download

**Agent:** worker

**Creates:** `apps/web/src/lib/compress/share.ts`

**The test that proves it:** none — three one-line wrappers over
`navigator.share`, which jsdom lacks. `compressor.test.tsx` (Task 12) stubs
`navigator.canShare`/`share` and asserts the button calls through with the
files, which covers the only logic here.

- [x] **10.1** `share.ts`:

```ts
import type { CompressResult } from './types'

export function toFiles(results: CompressResult[]): File[] {
  return results.map((r) => new File([r.blob], r.name, { type: r.type }))
}

export function canShareFiles(files: File[]): boolean {
  return (
    files.length > 0 &&
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files })
  )
}

/**
 * Must be called synchronously inside the click handler — an `await` before
 * `navigator.share` throws NotAllowedError. A dismissed sheet is not an error.
 */
export function shareFiles(files: File[]): Promise<void> {
  return navigator.share({ files }).catch((e: unknown) => {
    if (e instanceof DOMException && e.name === 'AbortError') return
    throw e
  })
}
```

- [x] **10.2** `pnpm -F web typecheck` → clean.

---

## Task 11 — Detail view: full-screen result, hold to compare, per-file preset

**Agent:** tdd -> worker

**Creates:** `apps/web/src/app/compress/use-object-url.ts`,
`apps/web/src/app/compress/detail-view.tsx` + `detail-view.test.tsx`

**The test that proves it:** the compressed image and its savings render;
pointer-down swaps the `src` to the original and pointer-up swaps it back; the
active preset (override, else batch) carries `aria-pressed`; choosing a preset
calls back with its name; Escape and the Close button both close.

- [x] **11.1** Write the failing test — `detail-view.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Job } from '@/lib/compress/types'
import { DetailView } from './detail-view'

const original = new File([new Uint8Array(1000)], 'a.jpg', {
  type: 'image/jpeg'
})
const compressed = new Blob([new Uint8Array(250)], { type: 'image/jpeg' })

const done: Job = {
  id: 'job-1',
  file: original,
  status: 'done',
  result: {
    blob: compressed,
    name: 'a.jpg',
    type: 'image/jpeg',
    kept: false,
    originalSize: 1000
  }
}

beforeEach(() => {
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) =>
    b === original ? 'blob:original' : 'blob:compressed'
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const noop = () => {}

describe('DetailView', () => {
  it('shows the compressed image and the savings', () => {
    render(
      <DetailView
        job={done}
        batchPreset="balanced"
        onPreset={noop}
        onClose={noop}
      />
    )
    expect(screen.getByRole('img').getAttribute('src')).toBe('blob:compressed')
    expect(screen.getByText(/1000 B → 250 B · −75%/)).toBeDefined()
  })

  it('shows the original while the pointer is held down', () => {
    render(
      <DetailView
        job={done}
        batchPreset="balanced"
        onPreset={noop}
        onClose={noop}
      />
    )
    const img = screen.getByRole('img')
    fireEvent.pointerDown(img)
    expect(screen.getByRole('img').getAttribute('src')).toBe('blob:original')
    fireEvent.pointerUp(img)
    expect(screen.getByRole('img').getAttribute('src')).toBe('blob:compressed')
  })

  it('marks the batch preset active when there is no override', () => {
    render(
      <DetailView
        job={done}
        batchPreset="balanced"
        onPreset={noop}
        onClose={noop}
      />
    )
    expect(
      screen.getByRole('button', { name: 'Balanced' }).getAttribute('aria-pressed')
    ).toBe('true')
    expect(
      screen.getByRole('button', { name: 'Better' }).getAttribute('aria-pressed')
    ).toBe('false')
  })

  it('marks the override active and reports a new choice', () => {
    const onPreset = vi.fn()
    render(
      <DetailView
        job={{ ...done, preset: 'smaller' }}
        batchPreset="balanced"
        onPreset={onPreset}
        onClose={noop}
      />
    )
    expect(
      screen.getByRole('button', { name: 'Smaller' }).getAttribute('aria-pressed')
    ).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Better' }))
    expect(onPreset).toHaveBeenCalledWith('better')
  })

  it('closes on Escape and on the Close button', () => {
    const onClose = vi.fn()
    render(
      <DetailView
        job={done}
        batchPreset="balanced"
        onPreset={noop}
        onClose={onClose}
      />
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('says it is compressing while the job is working', () => {
    render(
      <DetailView
        job={{ ...done, status: 'working', result: undefined }}
        batchPreset="balanced"
        onPreset={noop}
        onClose={noop}
      />
    )
    expect(screen.getByText(/Compressing…/)).toBeDefined()
    expect(screen.getByRole('img').getAttribute('src')).toBe('blob:original')
  })
})
```

- [x] **11.2** `pnpm -F web test detail-view` → FAIL, cannot resolve `./detail-view`

- [x] **11.3** `use-object-url.ts` — one object URL per blob, revoked when the blob
      changes or the component unmounts:

```ts
import { useEffect, useMemo } from 'react'

export function useObjectUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(
    () => (blob ? URL.createObjectURL(blob) : undefined),
    [blob]
  )
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url]
  )
  return url
}
```

- [x] **11.4** `detail-view.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { PRESET_ORDER, PRESETS } from '@/lib/compress/presets'
import { formatBytes, savingsPercent } from '@/lib/compress/size'
import type { Job, PresetName } from '@/lib/compress/types'
import { useObjectUrl } from './use-object-url'

type Props = {
  job: Job
  batchPreset: PresetName
  onPreset: (preset: PresetName) => void
  onClose: () => void
}

function caption(job: Job): string {
  if (job.status === 'done' && job.result) {
    const { originalSize, blob } = job.result
    return `${formatBytes(originalSize)} → ${formatBytes(blob.size)} · −${savingsPercent(originalSize, blob.size)}%`
  }
  if (job.status === 'error') return job.error ?? 'Failed'
  return 'Compressing…'
}

export function DetailView({ job, batchPreset, onPreset, onClose }: Props) {
  const [holding, setHolding] = useState(false)
  const originalUrl = useObjectUrl(job.file)
  const resultUrl = useObjectUrl(job.result?.blob)
  const active = job.preset ?? batchPreset

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const showOriginal = holding || !resultUrl
  const src = showOriginal ? originalUrl : resultUrl
  const release = () => setHolding(false)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={job.file.name}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="truncate text-sm">{job.file.name}</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center bg-muted/40 select-none"
        style={{ WebkitTouchCallout: 'none' }}
        onPointerDown={() => setHolding(true)}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={(e) => e.preventDefault()}
      >
        {src ? (
          <img
            src={src}
            alt={showOriginal ? 'Original' : 'Compressed'}
            draggable={false}
            className="max-h-full max-w-full object-contain"
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="font-mono text-xs text-muted-foreground">
          {caption(job)} · hold to see original
        </p>
        <div role="group" aria-label="Quality for this photo" className="flex gap-2">
          {PRESET_ORDER.map((name) => (
            <Button
              key={name}
              size="sm"
              variant={active === name ? 'default' : 'outline'}
              aria-pressed={active === name}
              onClick={() => onPreset(name)}
            >
              {PRESETS[name].label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

`WebkitTouchCallout` is a typed `CSSProperties` key — it stops iOS from opening
the image-save sheet on the long press we use for comparing.

- [x] **11.5** `pnpm -F web test detail-view` → 6 passed

---

## Task 12 — The compressor island

**Agent:** tdd -> worker

**Creates:** `apps/web/src/app/compress/compressor.tsx` + `compressor.test.tsx`

**The test that proves it:** picking files adds one row each and calls
`compress` with the batch quality; a finished row shows sizes, savings and a
download link named after the result; a rejected job shows its message on its
row while the others finish; `.heic` is skipped outside Safari with a status
line; changing the batch preset re-encodes non-overridden rows at the new
quality; "Save all" is absent when files cannot be shared and calls
`navigator.share` with the result files when they can.

- [x] **12.1** Write the failing test — `compressor.test.tsx`:

```tsx
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Compress } from '@/lib/compress/client'
import type { CompressResult } from '@/lib/compress/types'
import { Compressor } from './compressor'

type Call = {
  file: File
  quality: number
  resolve: (r: CompressResult) => void
  reject: (e: Error) => void
}

function fakeCompress() {
  const calls: Call[] = []
  const compress: Compress = (file, quality) =>
    new Promise((resolve, reject) => {
      calls.push({ file, quality, resolve, reject })
    })
  return { compress, calls }
}

const file = (name: string, size: number, type = 'image/jpeg') =>
  new File([new Uint8Array(size)], name, { type })

const result = (source: File, size: number): CompressResult => ({
  blob: new Blob([new Uint8Array(size)], { type: 'image/jpeg' }),
  name: source.name,
  type: 'image/jpeg',
  kept: false,
  originalSize: source.size
})

function addFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText('Add photos'), { target: { files } })
}

afterEach(() => {
  vi.restoreAllMocks()
  delete (navigator as { canShare?: unknown }).canShare
  delete (navigator as { share?: unknown }).share
})

describe('Compressor', () => {
  it('adds a row per photo and compresses each with the batch preset', () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    addFiles([file('a.jpg', 1000), file('b.jpg', 2000)])
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(calls.map((c) => [c.file.name, c.quality])).toEqual([
      ['a.jpg', 0.8],
      ['b.jpg', 0.8]
    ])
    expect(screen.getAllByText('Compressing…')).toHaveLength(2)
  })

  it('shows sizes, savings and a download link when a photo is done', async () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    const a = file('a.jpg', 1000)
    addFiles([a])
    await act(async () => calls[0].resolve(result(a, 250)))
    expect(screen.getByText('1000 B → 250 B · −75%')).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'Download' }).getAttribute('download')
    ).toBe('a.jpg')
  })

  it('names the download after the result when the type changed', async () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    const shot = file('shot.png', 1000, 'image/png')
    addFiles([shot])
    await act(async () =>
      calls[0].resolve({ ...result(shot, 250), name: 'shot.jpg' })
    )
    expect(screen.getByText('1000 B → 250 B · −75% · shot.jpg')).toBeDefined()
    expect(
      screen.getByRole('link', { name: 'Download' }).getAttribute('download')
    ).toBe('shot.jpg')
  })

  it('keeps an error on its own row', async () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    const a = file('a.jpg', 1000)
    const b = file('b.jpg', 1000)
    addFiles([a, b])
    await act(async () => {
      calls[0].reject(new Error('decode failed'))
      calls[1].resolve(result(b, 500))
    })
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[0]).getByText('decode failed')).toBeDefined()
    expect(within(rows[1]).getByText('1000 B → 500 B · −50%')).toBeDefined()
  })

  it('skips HEIC outside Safari and says so', () => {
    const { compress } = fakeCompress()
    render(<Compressor compress={compress} isSafari={false} />)
    addFiles([file('x.heic', 10, 'image/heic'), file('a.jpg', 10)])
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toMatch(/Skipped 1 HEIC/)
  })

  it('re-encodes non-overridden photos when the batch preset changes', () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    addFiles([file('a.jpg', 1000)])
    const quality = screen.getByRole('group', { name: 'Quality' })
    fireEvent.click(within(quality).getByRole('button', { name: 'Better' }))
    expect(calls).toHaveLength(2)
    expect(calls[1].quality).toBe(0.9)
    expect(
      within(quality)
        .getByRole('button', { name: 'Better' })
        .getAttribute('aria-pressed')
    ).toBe('true')
  })

  it('removes a row', () => {
    const { compress } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    addFiles([file('a.jpg', 1000)])
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.jpg' }))
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('hides Save all when the browser cannot share files', async () => {
    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    const a = file('a.jpg', 1000)
    addFiles([a])
    await act(async () => calls[0].resolve(result(a, 250)))
    expect(screen.queryByRole('button', { name: /save all/i })).toBeNull()
  })

  it('shares every finished result from Save all', async () => {
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: () => true
    })
    const share = vi.fn<(data: ShareData) => Promise<void>>(() =>
      Promise.resolve()
    )
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })

    const { compress, calls } = fakeCompress()
    render(<Compressor compress={compress} isSafari />)
    const a = file('a.jpg', 1000)
    const b = file('b.jpg', 1000)
    addFiles([a, b])
    await act(async () => {
      calls[0].resolve(result(a, 250))
      calls[1].resolve(result(b, 500))
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save all (2)' }))
    expect(share).toHaveBeenCalledTimes(1)
    const files = share.mock.calls[0][0].files ?? []
    expect(files.map((f) => [f.name, f.size])).toEqual([
      ['a.jpg', 250],
      ['b.jpg', 500]
    ])
  })
})
```

- [x] **12.2** `pnpm -F web test compressor` → FAIL, cannot resolve `./compressor`

- [x] **12.3** `compressor.tsx`:

```tsx
'use client'

import { useRef, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { compressInBrowser, type Compress } from '@/lib/compress/client'
import { ACCEPT, filterFiles, isSafariUA } from '@/lib/compress/input'
import { DEFAULT_PRESET, PRESET_ORDER, PRESETS } from '@/lib/compress/presets'
import { canShareFiles, shareFiles, toFiles } from '@/lib/compress/share'
import { formatBytes, savingsPercent } from '@/lib/compress/size'
import { createJob, createMemoryStore } from '@/lib/compress/store'
import type { Job, PresetName } from '@/lib/compress/types'
import { cn } from '@/lib/utils'
import { DetailView } from './detail-view'
import { useObjectUrl } from './use-object-url'

type Props = {
  /** Injected in tests; defaults to the real worker pool. */
  compress?: Compress
  /** Injected in tests; defaults to user-agent detection after hydration. */
  isSafari?: boolean
}

const noSubscribe = () => () => {}

export function Compressor({
  compress = compressInBrowser,
  isSafari: isSafariProp
}: Props) {
  const [store] = useState(createMemoryStore)
  const jobs = useSyncExternalStore(store.subscribe, store.all, store.all)
  const detectedSafari = useSyncExternalStore(
    noSubscribe,
    () => isSafariUA(navigator.userAgent),
    () => false
  )
  const safari = isSafariProp ?? detectedSafari

  const [batchPreset, setBatchPreset] = useState<PresetName>(DEFAULT_PRESET)
  const [skippedHeic, setSkippedHeic] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const runs = useRef(new Map<string, number>())

  function run(job: Job, preset: PresetName) {
    const token = (runs.current.get(job.id) ?? 0) + 1
    runs.current.set(job.id, token)
    store.update(job.id, { status: 'working', error: undefined })
    compress(job.file, PRESETS[preset].quality).then(
      (result) => {
        if (runs.current.get(job.id) === token)
          store.update(job.id, { status: 'done', result })
      },
      (e: unknown) => {
        if (runs.current.get(job.id) === token)
          store.update(job.id, {
            status: 'error',
            error: e instanceof Error ? e.message : String(e)
          })
      }
    )
  }

  function addFiles(list: Iterable<File>) {
    const { accepted, skippedHeic: skipped } = filterFiles(list, {
      isSafari: safari
    })
    setSkippedHeic(skipped)
    const added = accepted.map(createJob)
    store.add(added)
    for (const job of added) run(job, batchPreset)
  }

  function changeBatchPreset(preset: PresetName) {
    setBatchPreset(preset)
    for (const job of store.all()) if (!job.preset) run(job, preset)
  }

  function overridePreset(job: Job, preset: PresetName) {
    store.update(job.id, { preset })
    run(job, preset)
  }

  const finished = jobs.flatMap((j) =>
    j.status === 'done' && j.result ? [j.result] : []
  )
  const shareable = canShareFiles(toFiles(finished))
  const open = openId ? jobs.find((j) => j.id === openId) : undefined

  return (
    <section className="mt-8 flex flex-col gap-6">
      <div role="group" aria-label="Quality" className="flex gap-2">
        {PRESET_ORDER.map((name) => (
          <Button
            key={name}
            size="sm"
            variant={batchPreset === name ? 'default' : 'outline'}
            aria-pressed={batchPreset === name}
            onClick={() => changeBatchPreset(name)}
          >
            {PRESETS[name].label}
          </Button>
        ))}
      </div>

      <label
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground transition-colors hover:border-foreground/20"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          addFiles(e.dataTransfer.files)
        }}
      >
        <span>Drop photos here or tap to choose</span>
        <span className="mt-1 font-mono text-xs">
          JPEG · PNG · WebP{safari ? ' · HEIC' : ''}
        </span>
        <input
          type="file"
          multiple
          accept={ACCEPT(safari)}
          aria-label="Add photos"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </label>

      {skippedHeic > 0 ? (
        <p role="status" className="font-mono text-xs text-muted-foreground">
          Skipped {skippedHeic} HEIC — this browser cannot decode it; export as
          JPEG first.
        </p>
      ) : null}

      {jobs.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border">
          {jobs.map((job) => (
            <Row
              key={job.id}
              job={job}
              onOpen={() => setOpenId(job.id)}
              onRemove={() => store.remove(job.id)}
            />
          ))}
        </ul>
      ) : null}

      {finished.length > 0 && shareable ? (
        <Button onClick={() => void shareFiles(toFiles(finished))}>
          Save all ({finished.length})
        </Button>
      ) : null}

      {open ? (
        <DetailView
          job={open}
          batchPreset={batchPreset}
          onPreset={(preset) => overridePreset(open, preset)}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </section>
  )
}

function statusLine(job: Job): string {
  if (job.status === 'queued') return 'Queued'
  if (job.status === 'working') return 'Compressing…'
  if (job.status === 'error') return job.error ?? 'Failed'
  if (!job.result) return ''
  const { originalSize, blob, name } = job.result
  const base = `${formatBytes(originalSize)} → ${formatBytes(blob.size)} · −${savingsPercent(originalSize, blob.size)}%`
  return name === job.file.name ? base : `${base} · ${name}`
}

function Row({
  job,
  onOpen,
  onRemove
}: {
  job: Job
  onOpen: () => void
  onRemove: () => void
}) {
  const url = useObjectUrl(job.result?.blob)

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="block truncate text-sm">{job.file.name}</span>
        <span
          className={cn(
            'block font-mono text-xs',
            job.status === 'error' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {statusLine(job)}
        </span>
      </button>
      {job.status === 'done' && job.result && url ? (
        <a
          href={url}
          download={job.result.name}
          className="font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          Download
        </a>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        aria-label={`Remove ${job.file.name}`}
        onClick={onRemove}
      >
        ×
      </Button>
    </li>
  )
}
```

`shareFiles` is invoked synchronously in the click handler and `toFiles` is
synchronous — keep it that way (see Traps in `./plan.md`).

- [x] **12.4** `pnpm -F web test compressor` → 9 passed

---

## Task 13 — The page

**Agent:** tdd -> worker

**Creates:** `apps/web/src/app/compress/page.tsx` + `page.test.tsx`

**The test that proves it:** `/compress` renders a level-1 heading "Compress",
a link back to `/`, and the file input — from one synchronous Server Component
whose only client island is `Compressor`.

- [x] **13.1** Write the failing test — `page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import CompressPage from './page'

describe('CompressPage', () => {
  it('renders the heading, the back link and the picker', () => {
    render(<CompressPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Compress' })).toBeDefined()
    expect(screen.getByRole('link', { name: /tools/i }).getAttribute('href')).toBe('/')
    expect(screen.getByLabelText('Add photos')).toBeDefined()
  })
})
```

- [x] **13.2** `pnpm -F web test app/compress/page` → FAIL, cannot resolve `./page`

- [x] **13.3** `page.tsx`:

```tsx
import type { Metadata } from 'next'
import Link from 'next/link'

import { Compressor } from './compressor'

export const metadata: Metadata = {
  title: 'Compress',
  description: 'Lossy photo compression, entirely in the browser.'
}

export default function CompressPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Link
        href="/"
        className="font-mono text-xs text-muted-foreground hover:text-foreground"
      >
        ← Tools
      </Link>
      <h1 className="mt-6 text-2xl font-medium tracking-tight">Compress</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Lossy, on this device. Photos never leave the browser.
      </p>
      <Compressor />
    </main>
  )
}
```

No `'use client'` — `Compressor` is the island.

- [x] **13.4** `pnpm -F web test` → every file passes; note the count for the
      Verification table.

---

## Task 14 — Audit and verification

**Agent:** worker

- [x] **14.1** From `apps/web`, each must report nothing (`src/components/ui/` is
      generated and excluded on purpose):

```bash
grep -rnE 'shadow-|font-semibold|font-bold' src/app src/lib
grep -rnE '\[[0-9.]+(px|rem|em)\]|\[#[0-9a-fA-F]{3,8}\]' src/app src/lib
grep -rn 'jsquash\|framer-motion' src
```

- [x] **14.2** From the repo root — only `pnpm-lock.yaml` may exist:

```bash
find . -name package-lock.json -not -path '*/node_modules/*'
```

- [x] **14.3** `pnpm -F web build` → `✓ Compiled successfully`; `/compress` is
      listed as a static route; a worker chunk appears in the build output.

- [x] **14.4** Run the Verification table in `./plan.md`, including the iPhone
      and Chrome rows. Record what the iPhone run shows (seconds for 10 photos,
      savings) under **Observed consequences** in
      `docs/adr/0001-browser-native-image-encoding.md`.
