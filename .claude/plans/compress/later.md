Decisions: ./plan.md

# Compress — parked

Ideas kept for a later plan. Nothing here is approved and nothing here is a
task. The pipeline ignores this file: `loadChunk` reads only `plan.md` and
`steps.md`.

## Show the compressed photo and compare it against the original

**Asked for:** 2026-08-17 — after a photo is compressed, render the result so
the eye can check it against the original. Not urgent.

**What is already there:** tapping a row opens `apps/web/src/app/compress/detail-view.tsx`
full-screen and holding the image swaps the original back in. The comparison
exists; what is missing is any sign of it — the row is text only, carries no
thumbnail, and nothing says it opens.

So the question is not "build a compare view", it is which of these to build:

| Shape | Cost | Trap |
|---|---|---|
| Make the row look tappable — chevron, cursor, a "tap to compare" hint | almost nothing | still does not answer *which* of 50 photos got worse without opening each |
| Thumbnail per row, tap still opens the full view | one `<img>` per row off the result blob | every row holds a live object URL and a decoded bitmap; a 50-photo batch is a real memory bill |
| Thumbnail plus an inline before/after toggle on the row | more controls in a row that already has three | at row size the difference is invisible — artefacts only show near 100% |
| Side-by-side or a slider inside the detail view | replaces hold-to-compare | hold was chosen deliberately: swap-in-place is how the eye catches artefacts, side-by-side is how it misses them |

**Open questions**

- Where does a thumbnail come from? The worker already holds the decoded
  `ImageBitmap` and could return a ~200 px preview almost for free, instead of
  the UI decoding the full result blob a second time per row.
- Does the list stay usable at 50 rows once every row renders an image, on a
  phone?
- Does the thumbnail show the *result* or the *original*? Showing the result is
  the honest one, but for a `kept` file they are the same blob.
