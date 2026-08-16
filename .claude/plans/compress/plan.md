# Compress — browser-side lossy photo compressor

**Ships:** `/compress` takes many photos, compresses them in Web Workers, shows per-file
status and savings, opens any result full-screen with hold-to-compare and a per-file
preset, and hands the batch to the iOS share sheet or downloads it as one ZIP.
**Next:** none.

## Context

Home tools app on Vercel, used from iPhones. Photos must never hit the server, so the
whole pipeline is client-side. Encoder choice is already recorded in
`docs/adr/0001-browser-native-image-encoding.md` — this plan builds the tool around it.
The `/compress` card in `apps/web/src/components/dashboard/tools.ts` already exists and
404s by design.

## Decisions settled

| Decision | Chosen | Why |
|---|---|---|
| Encoder, worker pool, memory ceiling | **as in ADR 0001** — native `createImageBitmap` → `OffscreenCanvas.convertToBlob`, pool `min(hardwareConcurrency ?? 2, 4)`, one image per worker | not re-argued here |
| Output format | **keep input format**; ★ opaque PNG → JPEG; if the browser cannot encode the type (Safari + WebP) → JPEG, labelled | screenshots are the one PNG case worth winning; silent PNG-for-WebP is worse than a labelled JPEG |
| Resize | **none** | quality-only v1; `resizeWidth` on `createImageBitmap` is the later one-liner |
| Quality | **three batch-wide presets** Smaller / Balanced / Better = q 0.6 / 0.8 / 0.9, default Balanced | one tap on a phone; q 78 vs 82 is invisible |
| Detail view | tap a row → full-screen result; **hold to see original**; the same three presets re-encode this file only | swap-in-place is how the eye catches artefacts; a slider or side-by-side is more code for less |
| Never larger than input | result ≥ original size → keep original, show 0% | protects already-compressed JPEGs |
| Transparent PNG | stays PNG (lossless, usually kept as-is) and the row says so; a **Convert to JPEG** button on that row re-runs it flattened on the canvas default (black) | RGBA exports with a few 99%-alpha pixels are common; the user decides per file, not a threshold |
| Delivery | **"Save all" via `navigator.share({ files })`** when `canShare`; per-file download always; ★ **"Download all"** packs every finished photo into one store-only ZIP once two are done | one tap into Photos on a phone; on desktop the share sheet is missing or useless and browsers throttle multi-download, so an archive is the convenient path. Store-only: the photos are already compressed |
| Metadata | re-insert **only** `DateTimeOriginal` + `Orientation = 1`; read with `exifr` lite, write our own APP1 | Photos files the result under the shot date; no GPS leak; no maintained EXIF writer exists |
| Input | `<input multiple accept="image/*">` + drop zone; **`.heic` filtered out silently outside Safari**, one "skipped N" line | iOS transcodes HEIC on pick; Chrome cannot decode it |
| Rows | one row per file: queued → working → done / error, error text on its own row | batch never stops on one bad file |
| State | in memory behind a `store` interface (`add / update / remove / all`) | IndexedDB later is a one-module swap if iOS tab eviction bites |
| Tests | vitest on pure logic (pool, format policy, size rule, EXIF bytes, row rendering); Canvas checked by hand on iPhone | jsdom has no `OffscreenCanvas` |

## Premises corrected

- "Not necessarily JS, maybe a service" — Vercel's body limit and timeouts make a server path need storage + queue; the tool is 100% client-side.
- The card promises "resize and convert" — v1 does neither; the description changes.

## Traps

⚠ `convertToBlob({ type: 'image/webp' })` on Safari **returns a PNG without error**
  — check `blob.type`, never trust the requested type.
⚠ `createImageBitmap` without `imageOrientation: 'from-image'`
  — portrait iPhone photos come out sideways; and the re-inserted EXIF must then say
  `Orientation = 1`, or Photos rotates them a second time.
⚠ `navigator.share` must run inside the click handler, no `await` before it
  — encode first, share later; an async gap throws `NotAllowedError`.
⚠ Posting `ImageBitmap`/`ArrayBuffer` to a worker without the transfer list
  — copies 48 MB per photo; use transferables or the memory ceiling halves.
⚠ jsdom has neither `OffscreenCanvas` nor `Worker`
  — the tdd agent must test the pool with an injected fake, not a real worker.

## Out of scope

- Resize presets, IndexedDB persistence, "cancel batch", ZIP *compression* (stored, never deflated)
- WASM codecs (mozjpeg, oxipng, quantizer), HEIC decoding outside Safari
- Login / access control (separate, later)
- Any change to the tools index beyond the one-line description

## Verification

| Command | Green looks like |
|---|---|
| `pnpm -F web test` | all files pass, new tests listed under `src/app/compress` and `src/lib/compress` |
| `pnpm -F web typecheck` / `pnpm lint` / `pnpm fmt:check` | no output / `0 warnings and 0 errors` / nothing listed |
| `pnpm -F web build` | `✓ Compiled successfully`, `/compress` listed |
| iPhone Safari, 10 camera photos | rows finish in seconds, sizes drop ≥ 2×, hold shows original, "Save all" lands in Photos under the original dates, portrait stays portrait |
| Chrome desktop, drop a `.heic` | one "skipped" line, no error row |
| Chrome desktop, 3 photos → **Download all** | `photos-<today>.zip` lands in Downloads and unzips to 3 files, same-named ones numbered |

---

Execution detail: ./steps.md
