# Extraction route

**Ships:** `POST /api/paywall-remover` takes a URL and returns either an article
as typed text blocks or a named failure reason. No UI.
**Next:** `../02-library` — the IndexedDB store.

## Context

First server-side code in `apps/web`. A browser cannot `fetch` a third-party
article, so retrieval runs in a route handler; everything after it is client-side.

Two routes race: **A** fetches the URL as an ordinary reader, **B** asks the
Wayback availability API and fetches the snapshot. First *complete* result wins,
A preferred on tie. The loser is aborted.

`@mozilla/readability@^0.6.0` and `linkedom@^0.18.13` are already installed.

## Decisions settled

Rows marked ☆ were chosen by the planner, **not** confirmed by the user.

| Decision | Chosen | Why |
|---|---|---|
| Archive source | **Wayback only** for automated retrieval; archive.today is offered to the reader as a link | measured 2026-08-20: `archive.is`, `archive.today` and `archive.ph` all answer `429` + reCAPTCHA to curl **and** to Node `fetch`, from a residential IP. A real browser is served normally, so the link works where a server fetch cannot |
| Parser | `@mozilla/readability` + `linkedom` | Readability returns title, byline, publishedTime, siteName in one call; linkedom cold-starts far faster than jsdom |
| Blocks from the DOM, not HTML | Readability's `serializer` option is set to return the **element**, and the block walker reads that tree | the default serializer returns an HTML string, which would have to be re-parsed to build typed blocks. ☆ |
| jsdom escape hatch | named, not shipped | if a real site parses badly, swap the import in `extract.ts` — one line, both hand back a `document`. A runtime fallback is impossible: "parsed worse" has no detectable signal |
| Output shape | typed blocks `{ type, text }[]` | v1 is text-only by scope; nothing reaches `dangerouslySetInnerHTML`, so no sanitizer and no XSS surface — including for records replayed from IndexedDB years later |
| Completeness | **three states**: complete / suspicious / paywalled | the publisher's `isAccessibleForFree` decides paywall status; length is consulted only where the publisher declared nothing, and only to decide whether to keep route B alive |
| Suspicious floor | `article.length < 1500` chars | a soft-paywall preview is 2–4 paragraphs; a real article clears this. ☆ |
| Deadlines | race 8s, per-fetch 6s, `maxDuration = 20` | cold start plus two external fetches must finish inside the function budget. ☆ |
| `runtime` export | **omitted** | see Premises corrected |
| Method | `POST`, JSON body | keeps a long user URL out of URLs, logs and any cache |
| Record key | `rel=canonical` / `og:url`, else normalized URL | collapses amp, mobile and `utm_*` variants into one record |
| Failure reasons | `invalid-url \| blocked \| paywalled \| no-snapshot \| timeout` | `blocked` (403 / challenge) must read differently from `paywalled`; nothing is stored on failure |

## Premises corrected

- **`export const runtime` should not be written at all.** `nodejs` is already the
  default and the Edge Runtime is deprecated in 16.3.0
  (`apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.md`).
  The PRD's "explicit runtime" would add a line the docs tell you to remove.
- Readability parses JSON-LD itself, but only for **metadata**. It never recovers
  `articleBody` and never reads `isAccessibleForFree`, so the truncation detector
  is ours regardless.

## Traps

⚠ `route.ts` cannot share a segment with `page.tsx`
  — the handler lives at `src/app/api/paywall-remover/route.ts`, the page at
    `src/app/paywall-remover/page.tsx`. Same segment, and the build fails.
⚠ **SSRF.** The handler fetches a user-supplied URL from inside the deployment
  — allow `http`/`https` only, reject loopback, private, link-local and CGNAT
    ranges by resolved address, follow redirects manually with `redirect: 'manual'`
    and re-validate every hop, cap at 3. Skip any of it and this is an open proxy.
⚠ A 200 response is not a success
  — Cloudflare returns 200 with a challenge page. Check for a challenge marker
    before handing the HTML to Readability, or it "extracts" the interstitial.
⚠ Unbounded response body
  — cap at 5 MB while streaming and require an HTML content-type; a video URL
    otherwise fills the function's memory.
⚠ `vitest.config.mts` sets `environment: 'jsdom'` globally
  — extractor and race tests need `@vitest-environment node` in a docblock, or
    linkedom fights jsdom's globals.

## Out of scope

- archive.today, and crawler `User-Agent` / `Referer` spoofing — deliberate
- Images, embedded media, inline links inside article text
- Any storage or UI — chunks 02 and 03

## Verification

| Command | Green looks like |
|---|---|
| `pnpm -F web test` | tests under `src/lib/paywall-remover` cover URL normalization, the SSRF host check, the three-state detector, the race tiebreak, and block extraction |
| `pnpm -F web typecheck` | no output |
| `pnpm lint` | `0 warnings and 0 errors` |
| `pnpm -F web build` | `✓ Compiled successfully`, `/api/paywall-remover` listed |
