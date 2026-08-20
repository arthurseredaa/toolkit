# Describe route

**Ships:** `POST /api/paywall-remover` takes a URL and returns a record naming
the page — title, author, date, site name. No body text, no UI.
**Next:** `../02-library` — the IndexedDB store.

## Context

First server-side code in `apps/web`. A browser cannot `fetch` a third-party
page, so retrieval runs in a route handler; everything after it is client-side.

The article itself is read at archive.today. This route exists only so a saved
row carries a name a person recognizes instead of a raw URL.

`linkedom@^0.18.13` is already installed.

## Decisions settled

Rows marked ☆ were chosen by the planner, **not** confirmed by the user.

| Decision | Chosen | Why |
|---|---|---|
| Reading beats rendering | the tool opens `archive.is/newest/<url>` and never renders the article itself | **Confirmed with the user**: body extraction fails in too many ways, and the external copy is what gets read regardless. archive.today serves a real browser normally, so the link works exactly where a server fetch cannot |
| What the page is read for | title, author, `datePublished`, site name. Never the body | a name is all a library row needs. Nothing else survives the request |
| Parser | `linkedom` plus our own `metadata.ts` | Readability parses a body we no longer want, and was removed. og tags and JSON-LD are the whole surface, and both are short to read directly |
| Metadata order | `og:` tags, then JSON-LD, then `<title>` | `<title>` usually carries a `\| Site` suffix; `og:title` is the name the publisher chose. ☆ |
| Robustness | metadata survives what body extraction does not | a Cloudflare challenge page and a Medium preview both still carry `<title>` and `og:` tags |
| Never fails | a page it cannot open still yields a record named from the URL slug | the archive link is built from the URL alone, so nothing about a failed fetch needs to reach the reader |
| Failure reason | `invalid-url`, and nothing else | it is the only input the tool genuinely cannot act on |
| Method | `POST`, JSON body | keeps a long user URL out of URLs, logs and any cache |
| Record key | `rel=canonical` / `og:url`, else normalized URL | collapses amp, mobile and `utm_*` variants into one record |
| Deadlines | per-fetch 6s, `maxDuration = 20` | cold start plus one external fetch must finish inside the function budget. ☆ |
| `runtime` export | **omitted** | see Premises corrected |

## Premises corrected

- **`export const runtime` should not be written at all.** `nodejs` is already the
  default and the Edge Runtime is deprecated in 16.3.0
  (`apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md`).
  The PRD's "explicit runtime" would add a line the docs tell you to remove.
- **archive.today is not behind Cloudflare.** Measured 2026-08-20: `archive.is`,
  `archive.today` and `archive.ph` all answer `429` plus an nginx reCAPTCHA to
  curl **and** to Node `fetch`, from a residential IP. It is never fetched from
  the server for that reason, only linked.

## Traps

⚠ `route.ts` cannot share a segment with `page.tsx`
  — the handler lives at `src/app/api/paywall-remover/route.ts`, the page at
    `src/app/paywall-remover/page.tsx`. Same segment, and the build fails.
⚠ **SSRF.** The handler fetches a user-supplied URL from inside the deployment
  — allow `http`/`https` only, reject loopback, private, link-local and CGNAT
    ranges by resolved address, follow redirects manually with `redirect: 'manual'`
    and re-validate every hop, cap at 3. Skip any of it and this is an open proxy.
⚠ A 200 response is not a success
  — Cloudflare returns 200 with a challenge page. `isChallengePage` runs before
    the HTML is parsed, or the interstitial's `<title>` becomes the record name.
⚠ Unbounded response body
  — cap at 5 MB while streaming and require an HTML content-type; a video URL
    otherwise fills the function's memory.
⚠ `vitest.config.mts` sets `environment: 'jsdom'` globally
  — the route, metadata and pipeline tests need `@vitest-environment node` in a
    docblock, or linkedom fights jsdom's globals.

## Out of scope

- Fetching archive.today or Wayback from the server — deliberate, see above
- Crawler `User-Agent` / `Referer` spoofing — deliberate
- Any article text, images or embedded media
- Any storage or UI — chunks 02 and 03

## Verification

| Command | Green looks like |
|---|---|
| `pnpm -F web test` | tests under `src/lib/paywall-remover` cover URL normalization, the SSRF host check, metadata precedence, the slug fallback, and the challenge-page path |
| `pnpm -F web typecheck` | no output |
| `pnpm lint` | `0 warnings and 0 errors` |
| `pnpm -F web build` | `✓ Compiled successfully`, `/api/paywall-remover` listed |
