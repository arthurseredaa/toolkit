# Article library store

**Ships:** an IndexedDB-backed store for saved articles — list, save, delete —
with tests. No UI yet.
**Next:** `../03-reader-ui` — the page, the library list and the dashboard count.

## Context

`apps/web/src/lib/compress/store.ts:3` defines the shape this feature wants, but
its `all(): Job[]` is **synchronous** and IndexedDB is not. Reusing the shape
verbatim is impossible; reusing the *pattern* is the point.

`apps/web/src/app/compress/compressor.tsx:41` shows the constraint that follows:
`useSyncExternalStore(store.subscribe, store.all, store.all)`. `all()` must stay
sync **and** return a stable reference until something actually changes.

`fake-indexeddb@^6.2.5` is already installed. No install step is needed.

## Decisions settled

Rows marked ☆ were chosen by the planner, **not** confirmed by the user.

| Decision | Chosen | Why |
|---|---|---|
| What memory holds | **the name of the article and the URL it opens** | article bodies were dropped when the tool stopped rendering them: a record is a few hundred bytes, so the whole library fits in memory and `all()` can stay synchronous. **Confirmed with the user** |
| Interface | `all()` sync from memory; `load / add / remove / clear` async; `status()`; `subscribe` unchanged | keeps the compress store's `subscribe` contract and React integration; only the methods that genuinely touch disk become async. ☆ |
| Backend | IndexedDB, one DB, one object store, `savedAt` index | `localStorage` caps near 5 MB in Safari — roughly 200 articles — and loses them silently past that. ☆ |
| Duplicate record | same `id` **or** same `url` supersedes, and the older row is deleted | a row saved from the URL alone comes back under the canonical id the moment the page declares one. Keying on id alone would leave two rows for one article |
| Test backend | `fake-indexeddb` | jsdom ships no IndexedDB; without it the store cannot be tested at all. ☆ |
| Schema versioning | version 1, `onupgradeneeded` creates the store | a v2 migration is a real chunk when it arrives, not a guess now. ☆ |
| Raw IndexedDB API | no `idb` wrapper | one object store and four operations; a promise helper is a few lines. ☆ |
| Saving | automatic, and **twice**: once from the URL, again once the server has named the page | the first write makes the row exist while the reader is already away at archive.today; the second replaces it. Clutter is handled by delete |
| Failures | only `invalid-url` stores nothing | **Confirmed with the user**: a URL we could not read is still a URL archive.today can. Anything less than a broken address earns a row |

## Traps

⚠ `all()` must return the **same array reference** between changes
  — `useSyncExternalStore` compares with `Object.is`. A store that rebuilds its
    array on every read re-renders forever. `store.ts:24` gets this right by
    replacing the array only inside `set()`.
⚠ **Safari ITP clears IndexedDB after 7 days without a visit.**
  — Added to the Home Screen it does not apply. Otherwise the library quietly
    empties and there is nothing in the code that will tell you why.
⚠ A rejected `load()` must not take the page down
  — private-mode Safari and storage pressure both refuse to open a database.
    The store surfaces an unavailable state; it does not throw at render.
⚠ Structured clone rejects what JSON accepts
  — every field on a record is a string, a number or null, so keep it that way.
    One `Date`, one class instance, one function, and `add()` throws at runtime
    only.
⚠ `all()` before `load()` resolves returns `[]`
  — that is "still loading", not "nothing saved". `status()` exists to tell the
    two apart; chunk 03 renders them differently.

## Out of scope

- Server database, cross-device sync, auth — the stated next feature
- Full-text search, markdown export, iOS share sheet
- Quota handling beyond reporting the failure
- Paging or capping the number of records loaded
- Every piece of UI — chunk 03

## Verification

| Command | Green looks like |
|---|---|
| `pnpm -F web test` | tests under `src/lib/paywall-remover` cover round-tripping a record, one row per URL across differing ids, delete, `subscribe` firing, `all()` reference stability, and `load()` failing without throwing |
| `pnpm -F web typecheck` | no output |
| `pnpm lint` | `0 warnings and 0 errors` |

