# ZIP size preview

**Ships:** `zipSize(files)` in `apps/web/src/lib/selftest/zip-size.ts` — the
byte size a "Download all" archive will have, computed from file metadata
alone, before any photo is read.
**Next:** show it on the Download all button.

## Context

`/compress` already builds a store-only ZIP with `client-zip`
(`apps/web/src/lib/compress/`). On a phone the archive can be tens of
megabytes and the button gives no warning before the download starts.

`client-zip` can tell us the size in advance without touching file
contents, because a store-only archive's length is a pure function of the
entry names and sizes. This step exposes that as one function. Wiring it
into the UI is the next step, not this one.

## Decisions settled

| Decision | Chosen | Why |
|---|---|---|
| Source of the number | **`predictLength` from `client-zip`** | already a dependency; exact rather than estimated |
| Input shape | `{ name: string; size: number }[]` | the two fields the archive header needs; callers already have both |
| Return type | **`number`** | `predictLength` returns a `number`, so no conversion is needed and none should be added |
| Where it lives | `apps/web/src/lib/selftest/` | pure, no browser APIs, unit-testable in jsdom |
| Scope | the function and its test, nothing else | the button change is a separate step |

## API facts

From `client-zip`:

- `predictLength(files)` returns a **`number`** — the exact byte count of
  the archive `downloadZip` would produce for the same input. Not an
  estimate, not a `bigint`.
- Entries may be metadata-only: `{ name, size }` with no `input` is a
  valid entry for prediction.
- For a single entry `{ name: 'a.txt', size: 10 }` the predicted length is
  **`120`** bytes — 30 for the local header, 46 for the central directory
  record, 22 for the end-of-central-directory record, 5 for the name twice,
  and 10 of content.

## Traps

⚠ Do not convert the result. `predictLength` already returns a `number`;
  wrapping it in `Number()` or casting it hides a mismatch instead of
  reporting one.
⚠ Do not widen the declared return type. If the value does not fit
  `number`, that is a fact to report, not a signature to loosen.

## Verification

`pnpm -F web test` and `pnpm -F web typecheck`, both from the repo root.
