# Reader and library UI

**Ships:** `/paywall-remover` accepts a URL, shows the extracted article at
`/paywall-remover/[id]`, lists everything saved, deletes per record, and the
dashboard card shows the real count.
**Next:** none — server database, sync and auth are a separate feature.

## Context

Chunks 01 and 02 give a route handler and a store. This is the only chunk a
person can see. The card at `apps/web/src/components/dashboard/tools.ts:34`
currently 404s and claims a hardcoded `0 articles`.

Fresh extractions save first, then navigate to `/paywall-remover/[id]`, so a new
article and a saved one render through exactly one code path.

Because chunk 02 keeps whole articles in memory, the reader is a **synchronous
lookup** over `store.all()`. There is no per-article fetch and no loading state
once `load()` has resolved. Page shell and typography follow
`apps/web/src/app/compress/page.tsx:13`.

## Decisions settled

Rows marked ☆ were chosen by the planner, **not** confirmed by the user.

| Decision | Chosen | Why |
|---|---|---|
| Routing | `/paywall-remover` is input + library; `/paywall-remover/[id]` is the reader | one render path for fresh and saved articles, and the back button behaves. ☆ |
| `[id]` data source | `store.all()`, never the network | re-opening offline is the point of the library |
| Unknown `[id]` | "not in your library" plus a link back, not a 404 page | the id came from a record the user may have deleted on this device. Only shown once `status()` is `ready` — before that it would accuse the user of deleting an article that is still loading. ☆ |
| Reader header | title, author, published date, badge naming the winning route, snapshot date when archive, link to the original | the badge is the only honest way to show archived text may be stale |
| Failure UI | reason sentence, link to the original, **working** retry that re-runs both routes | a failed URL is not an article; nothing is stored |
| Delete | per record in the list, **working**, no confirm dialog | a JS `confirm()` blocks; re-extracting costs one request. ☆ |
| Empty state | plain text, no button | the URL input is already on screen; a second call to action would be a control with nowhere to go. ☆ |
| Dashboard count | client component reads the store, renders `N articles`; nothing rendered until `load()` resolves | the current `0 articles` is a hardcoded lie; a flash of `0` before hydration is a worse one. ☆ |
| Card description | replaced — it cannot clear a server-side paywall | "Read without paywalls" promises something the tool does not do |
| Input placeholder | an example URL, no affordance claim | it is a hint, not a control |
| Not shipped | search, export, share sheet, keyboard shortcuts | nothing renders that has no handler behind it |

## Traps

⚠ **A control that renders but does nothing passes every gate.**
  — `test`, `typecheck` and `lint` all verify conformance to the plan, so a dead
    button yields a test asserting a dead button renders, and it goes green.
    Retry and delete each need a test that **presses** it, not one that finds it.
    Precedent: `.claude/plans/design-system/02-tools-index/plan.md:23` shipped a
    ⌘K hint with no handler and every check passed.
⚠ Reading IndexedDB during render
  — `all()` is synchronous but empty until `load()` resolves. Hydrate in an
    effect and drive the list with `useSyncExternalStore`, or React 19 renders
    the empty state and never re-renders.
⚠ Saving before navigating
  — navigate first and `[id]` reads a record that is not written yet. The order
    is: extract, save, then navigate.
⚠ `tools.ts` is imported by a server component (`src/app/page.tsx:2`)
  — the count cannot come from that array. It needs a client component inside
    the card, not a change to the shared `Tool` type's `stat` string.
⚠ The React Compiler is on (`next.config.ts:5`)
  — memoization is per-component and bails silently. A store subscription that
    mutates its snapshot instead of replacing it will not re-render.

## Out of scope

- Images and embedded media in the reader — v1 renders text blocks only
- Server database, cross-device sync, auth for two accounts
- Markdown export, iOS share sheet, full-text search
- Changing any other tool card

## Verification

| Command / action | Green looks like |
|---|---|
| `pnpm -F web test` | the reader renders blocks and the badge; retry **is clicked** and re-issues the request; delete **is clicked** and removes the record; unknown `[id]` shows the recovery message only after load resolves |
| `pnpm -F web typecheck` / `pnpm lint` | no output / `0 warnings and 0 errors` |
| `pnpm -F web build` | `✓ Compiled successfully`, `/paywall-remover` and `/paywall-remover/[id]` listed |
| A soft-paywalled article | full text, badge says publisher, record appears in the library, dashboard count goes up |
| An article with a snapshot behind a hard paywall | full text, badge says archive with the snapshot date |
| A Cloudflare-protected article | `blocked`, link to the original, retry works, library unchanged |
| Reload with the network off | every saved article still opens |
