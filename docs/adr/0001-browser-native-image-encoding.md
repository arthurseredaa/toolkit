# ADR 0001 — Encode images in the browser with native Canvas APIs

**Date:** 2026-08-16
**Status:** Accepted

## Context

`apps/web` is a home tools app deployed on Vercel. The `/compress` tool must
take many photos at once (JPEG, PNG, WebP, …), lossy-compress them, and be as
efficient as possible. Vercel serverless functions cap request bodies at ~4.5 MB,
time out, and have no persistent disk, so a server-side `sharp`/libvips service
would need external upload storage plus a job queue. That rules out the server;
compression runs in the browser. The open question was *which encoder*.

## Decision

Native browser pipeline, no third-party codec:

    File → createImageBitmap (orientation applied) → OffscreenCanvas
         → convertToBlob({ type, quality }) → Blob

Runs inside a pool of Web Workers, `min(navigator.hardwareConcurrency, 4)`,
one image in memory per worker, the rest queued. Output format policy is
**keep the input format** (JPEG → JPEG, PNG → PNG, WebP → WebP).

The encoder is isolated behind one module with the shape
`(bitmap, format, quality) → Blob`, so it can be swapped without touching the
UI or the queue.

## Reasons

- Zero dependencies, nothing extra to ship or lazy-load.
- Fastest option: the browser's own libjpeg-turbo/libwebp. Estimated ~10× faster
  per image than a WASM mozjpeg encode (order-of-magnitude from experience,
  **not measured** — see Success metrics).
- With "keep the format", native JPEG/WebP encoding covers the common case.
- Most of the win (2–5×) comes from lossy quality and downscaling; encoder
  choice moves the needle by ~10–20%.

## Constraints that shaped it

- **Vercel**: no server-side processing of uploads (body limit, timeouts).
- **Memory, not CPU, is the ceiling**: a 12 MP photo is ~48 MB RGBA once
  decoded regardless of file size; mobile Safari silently reloads the tab at
  roughly 1–1.5 GB. Hence the small worker pool and the queue. Batch size is
  otherwise unbounded — 500 photos is a longer queue, not 500 photos in RAM.
- Canvas writes **lossless PNG only** — no native lossy PNG (TinyPNG-style
  palette quantization needs a WASM quantizer). Decided: **opaque PNG (e.g.
  iPhone screenshots) is re-encoded as JPEG**, a deliberate exception to
  "keep the format"; PNG with alpha stays lossless PNG.
- **Safari does not encode WebP** via Canvas — `convertToBlob` silently returns
  PNG. Detect and surface, do not trust the requested type.
- Canvas **strips all metadata** (EXIF, GPS, ICC). Orientation must be applied
  at decode time (`imageOrientation: 'from-image'`) or photos come out rotated.
  Decided: **re-insert only `DateTimeOriginal` and `Orientation = 1`** into the
  output JPEG (read with `exifr` lite, written as a hand-built APP1 segment), so
  iOS Photos files the result under the original capture date. GPS and the rest
  are dropped.
- Primary devices are **iPhones / Safari**. HEIC decodes natively there, and
  the iOS photo picker transcodes HEIC to JPEG on selection anyway. Chrome and
  Firefox reject `.heic` with a hint; a WASM libheif decoder is a later plan.
- Safari cannot encode WebP: when the requested output type is unavailable the
  encoder falls back to JPEG and the UI labels the change.
- Lossy encoding is irreversible and compounds; the tool must never overwrite
  the original.

## Alternatives considered

| Alternative | Why not (now) | If chosen instead |
|---|---|---|
| Server-side `sharp` (libvips) in a workspace service | Vercel limits; needs storage + queue; photos leave the device | Best ratio and speed, HEIC/AVIF for free, but hosting, auth and cleanup of uploaded files become our problem |
| WASM jSquash (`@jsquash/jpeg` mozjpeg, `@jsquash/webp`, `@jsquash/oxipng`) | ~1–3 MB WASM, ~10× slower per image, still no lossy PNG (jSquash ships no quantizer) | ~10–20% smaller JPEG at equal quality, identical output on every browser, WebP on Safari |
| Hybrid — native for JPEG, WASM only where native falls short (PNG, WebP on Safari) | Premature; no measurements yet | Natural next step once numbers exist; the encoder module boundary makes it a local change |

## Expected consequences

- Swapping the encoder is a one-module change; UI, queue and worker pool stay.
- Transparent PNG gains will be small or negative until a quantizer is added.
- Opaque PNG changes extension to `.jpg`; the UI must show it.
- Output carries only capture date and orientation: no GPS leak, no camera
  info, no ICC profile (wide-gamut photos are flattened to sRGB).
- Chrome users cannot drop `.heic` files until a decoder is added.
- Never resizes and never returns a file larger than the input (falls back to
  the original), so heavily compressed inputs report 0% and stay untouched.

## Observed consequences

_(fill in as they appear)_

## Success metrics

- 10 phone JPEGs (~3 MB, 12 MP each) finish in ≤ 5 s on a laptop; the UI never
  blocks.
- Default quality yields ≥ 2× smaller files with no visible artefacts at 100%.
- If a later measurement shows WASM mozjpeg saves > 20% at acceptable speed,
  revisit this ADR (supersede, do not edit in place).

## Links

- jSquash package list and worker usage: https://github.com/jamsinclair/jsquash
- `OffscreenCanvas.convertToBlob`: https://developer.mozilla.org/docs/Web/API/OffscreenCanvas/convertToBlob
- `createImageBitmap` `imageOrientation`: https://developer.mozilla.org/docs/Web/API/Window/createImageBitmap
- Vercel function limits: https://vercel.com/docs/functions/limitations
- Design-system plan that reserved the `/compress` route: `.claude/plans/design-system/02-tools-index/plan.md`
