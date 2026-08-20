# Library UI

**Ships:** `/paywall-remover` takes a URL, opens it at archive.today, keeps it
in a list, deletes per record, and the dashboard card shows the real count.
**Next:** none — server database, sync and auth are a separate feature.

## Context

Chunks 01 and 02 give a describe route and a store. This is the only chunk a
person can see. The card at `apps/web/src/components/dashboard/tools.ts:34`
originally 404'd and claimed a hardcoded `0 articles`.

There is no in-app reader. Every way into an article — the submit button and
every row in the list — lands on `archive.is/newest/<url>` in a new tab.

Because chunk 02 keeps whole records in memory, the list is a **synchronous**
read over `store.all()`. Page shell and typography follow
`apps/web/src/app/compress/page.tsx:13`.

## Decisions settled

Rows marked ☆ were chosen by the planner, **not** confirmed by the user.

| Decision | Chosen | Why |
|---|---|---|
| Reading beats rendering | no reader route at all; every click leaves for archive.today | **Confirmed with the user**: too many articles cannot be rendered faithfully, and the external copy is the one that gets read. A reader that works sometimes is worse than a link that works always |
| Routing | one page, `/paywall-remover`. No `[id]` segment | with nothing rendered in-app there is no second route to render it on |
| Submit | opens the archive tab **inside the click**, then saves | a tab opened after an `await` is a popup and the browser blocks it. See Traps |
| Saving | the URL row first, the server's named row second | the reader is gone to archive.today within a second; the row has to exist before they come back, and improve afterwards |
| Row target | external link, `target="_blank" rel="noreferrer"` | a real anchor, so middle-click and copy-link behave. Not an onClick handler |
| URL validation | client-side `normalizeUrl` before anything else | the archive link is built from the URL, so validity must be known before the tab opens. The route still validates for SSRF |
| Input type | `type="text" inputMode="url"` | `type="url"` hands validation to the browser, which swallows submit before our own message can be shown. ☆ |
| Delete | per record in the list, **working**, no confirm dialog | a JS `confirm()` blocks; re-adding a URL costs one paste. ☆ |
| Empty state | plain text, no button | the URL input is already on screen; a second call to action would be a control with nowhere to go. ☆ |
| Dashboard count | client component reads the store, renders `N articles`; nothing rendered until `load()` resolves | the original `0 articles` was a hardcoded lie; a flash of `0` before hydration is a worse one. ☆ |
| Card description | `Archive links, kept locally` | the earlier text promised a reader the tool no longer has |

## Traps

⚠ **`window.open` after an `await` is a popup, and the browser blocks it.**
  — the call has to run in the same tick as the click. `archiveTodayUrl` needs
    no network, so the tab opens first and the describe request follows. The
    test asserts the **order**, not that open was called:
    `expect(order).toEqual(['open', 'fetch'])`.
⚠ **A control that renders but does nothing passes every gate.**
  — `test`, `typecheck` and `lint` all verify conformance to the plan, so a dead
    button yields a test asserting a dead button renders, and it goes green.
    Delete needs a test that **presses** it, not one that finds it.
    Precedent: `design-system/02-tools-index/plan.md:23` shipped a dead ⌘K hint.
⚠ Reading IndexedDB during render
  — `all()` is synchronous but empty until `load()` resolves. Hydrate in an
    effect and drive the list with `useSyncExternalStore`, or React 19 renders
    the empty state and never re-renders.
⚠ Two writes for one URL
  — the optimistic row is keyed by the URL, the server's row by the canonical.
    Without the supersede rule in `store.add` the library shows both.
⚠ `tools.ts` is imported by a server component (`src/app/page.tsx:2`)
  — the count cannot come from that array. It needs a client component inside
    the card, not a change to the shared `Tool` type's `stat` string.
⚠ The React Compiler is on (`next.config.ts:5`)
  — memoization is per-component and bails silently. A store subscription that
    mutates its snapshot instead of replacing it will not re-render.

## Out of scope

- Rendering article text anywhere in the app
- Server database, cross-device sync, auth for two accounts
- Markdown export, iOS share sheet, full-text search, keyboard shortcuts
- Changing any other tool card, and any control with no handler behind it

## Verification

| Command / action | Green looks like |
|---|---|
| `pnpm -F web test` | the tab opens before the request goes out; the URL row is replaced by the named one; a failed request leaves the URL row standing; delete **is clicked** and removes the record; an unparseable address saves and opens nothing |
| `pnpm -F web typecheck` / `pnpm lint` | no output / `0 warnings and 0 errors` |
| `pnpm -F web build` | `✓ Compiled successfully`, `/paywall-remover` listed and no `[id]` route |
| A paywalled article | archive.today opens in a new tab, a row appears named after the page, dashboard count goes up |
| A Cloudflare-blocked article | archive.today still opens, the row is named from the URL slug |
| Reload with the network off | every saved row is still listed and still links out |
