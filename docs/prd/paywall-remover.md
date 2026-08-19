# Paywall Remover — reader with a local library

**Ships:** `/paywall-remover` takes a URL, races two retrieval routes, renders the
article in a reader view, and keeps every successful extraction in a local library
that can be reopened offline and deleted.
**Next:** server database + cross-device sync, then auth for two accounts.

## Context

Home tools app on Vercel, read from an iPhone. The `/paywall-remover` card exists at
`apps/web/src/components/dashboard/tools.ts:31` and 404s by design.

This is the **first server-side code in `apps/web`** — there is no route handler, ORM,
env file or auth dependency in the repo today. A browser cannot `fetch` a third-party
article: cross-origin reads are blocked, and `no-cors` returns an opaque response with
no body. Retrieval therefore runs in a route handler; only the library stays client-side.

`apps/web/src/lib/compress/store.ts:3` already defines the store shape this feature
needs (`all / add / update / remove / clear / subscribe`). Reuse it, swap the backend.

## The pipeline

Two routes run **in parallel**; the first *complete* result wins.

| Route | Source | Complete means |
|---|---|---|
| **A — publisher** | one GET to the URL as an ordinary reader, then `application/ld+json` → `articleBody`, else `__NEXT_DATA__`, else Readability heuristic over the DOM | body present **and** `isAccessibleForFree !== false` **and** no `hasPart` paywall section left |
| **B — archive** | Wayback availability API, then archive.today; fetch the snapshot and extract from it | body present and the snapshot is not a paywall page itself |

★ **First complete, not first response.** A soft paywall answers in 200 ms with three
preview paragraphs and would beat every archive if arrival order decided. When both
routes complete, **A wins** — it is current, the snapshot may be stale. The loser is
cancelled with `AbortController` so it does not hold the function open.

## Decisions settled

| Decision | Chosen | Why |
|---|---|---|
| Methods in scope | **archives + the publisher's own public payload**; ordinary browser UA | no identity spoofing; we read what the site serves any reader, plus copies that already exist |
| Order | **parallel race**, A preferred on tie | fresh articles have no snapshot yet, so sequential pays a wasted round trip on the common case |
| Truncation detector | schema.org `isAccessibleForFree` and `hasPart` + `cssSelector` | the publisher's own declaration, written for Google; beats guessing by word count |
| Total failure | reason (`blocked at edge` / `behind paywall` / `no snapshot`) + link to the original + a retry that re-runs both routes; **nothing is stored** | a failed URL is not an article; a second record type buys nothing in v1 |
| Record key | `rel=canonical` or `og:url` when the page gives one, else normalized URL (drop `utm_*`, fragment, trailing slash, lowercase host) | collapses amp / mobile / tracking variants of one article into one record |
| Saving | **automatic on every successful extraction** | the expensive part already happened; re-opening must never touch the network, and snapshots disappear. Clutter is handled by delete |
| Storage | IndexedDB behind the `Store` shape above | no server, no auth needed, works offline |
| Runtime | `nodejs`, explicit `maxDuration` | see Premises corrected |
| Reader view | title, author, published date, a badge naming the winning route, link to the original | the badge is the only honest way to show that archived text may be stale |
| Library | list of saved records, tap to open from IndexedDB, delete per record; `stat` on the dashboard card counts them | matches the card's `0 articles` |

## Premises corrected

- **Edge Runtime is deprecated in Next 16.3.0** (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md`). The obvious choice for a fetch proxy is now the wrong one.
- The card reads "Read without paywalls". It cannot clear a server-side paywall, and it is not meant to — the description should say what it does.

## Traps

⚠ `route.ts` cannot share a segment with `page.tsx` — the handler must live under a
  different path than the page, or the build fails.
⚠ **SSRF.** The route fetches a user-supplied URL from inside the deployment. Allow only
  `http`/`https`, reject private and link-local address ranges, and cap redirects — or
  the endpoint becomes an open proxy into anything the function can reach.
⚠ Safari ITP clears IndexedDB after **7 days** without a visit. Added to the Home Screen
  it does not apply — otherwise the library quietly empties.
⚠ Cloudflare-class bot protection answers `403` before the paywall is ever reached.
  That is a distinct failure reason from "behind paywall" and must read differently.
⚠ Vercel cold start plus two external fetches sits close to the default timeout; the
  race must have its own deadline, shorter than `maxDuration`.

## Out of scope

- Crawler `User-Agent` and `Referer` spoofing — considered and deliberately excluded from v1
- Server database, cross-device sync, auth for two accounts — the stated next chunk
- Markdown export, iOS share sheet, full-text search over the library
- Images and embedded media in the reader view — **assumption, not a settled decision**: v1 renders text only

## Verification

| Command / action | Green looks like |
|---|---|
| `pnpm -F web test` | new tests under `src/lib/paywall-remover` cover URL normalization, the truncation detector, the race tiebreak, and the store |
| `pnpm -F web typecheck` / `pnpm lint` / `pnpm fmt:check` | no output / `0 warnings and 0 errors` / nothing listed |
| `pnpm -F web build` | `✓ Compiled successfully`, `/paywall-remover` listed |
| A soft-paywalled article | full text, badge says publisher, record appears in the library |
| An article with a snapshot but a hard paywall | full text, badge says archive, badge shows the snapshot date |
| A Cloudflare-protected article | `blocked at edge`, link to the original, retry present, library unchanged |
| Reload with the network off | every saved article still opens |
