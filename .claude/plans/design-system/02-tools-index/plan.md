# Tools index page

**Ships:** `/` renders five tool cards with a mount stagger, covered by unit tests.
**Next:** none.

## Context

The homepage **is** the tools index — each card links to a tool route that does
not exist yet. Everything is static; the only moving part is a mount-time
stagger on the grid. Depends on `../01-foundation/`, which must land first.

## Decisions settled

| Decision | Chosen | Why |
|---|---|---|
| Page shape | Server Component + **one** client island | only `motion` forces `'use client'`; the page itself stays server-rendered |
| Card links | real `<Link href>`, **routes 404** | markup and focus behaviour are correct now; tool pages land later |
| Navigation | **none** — sidebar, nav, active pill, mobile bottom bar all cut | one page, so the cards *are* the navigation |
| Card anatomy | name + description + mono stat. No badge | the mono stat already carries the information; a badge would compete with it |
| Recent activity list | **dropped** | `separator` lost its last call site with it |
| Placeholder card | **dropped** | new tools arrive in code, so a "New tool" affordance is fiction |
| Icons on cards | **none** | `lucide-react` ships as a shadcn dependency but is intentionally unused |
| ⌘K hint | **not rendered** | an affordance that does nothing is worse than none — it shipped inert and every gate stayed green |
| Motion | mount stagger only — fade + 12px rise, 180ms, 25ms stagger, ease-out | wrapped in `useReducedMotion()`. Hover is a border-colour transition and nothing else |
| Tests | **Vitest 4.1.10 + React Testing Library** | config from the bundled Next guide. The `vitest` skill in `.agents/skills/` documents 5.x beta — its only breaking changes (`workspace`→`projects`, `deps.optimizer.*`) are ones we do not use |
| Design-rule enforcement | **one-time manual grep**, no script | a "zero arbitrary values" regex cannot separate `text-[13px]` from `data-[side=top]` without guesswork |

## Traps

⚠ jsdom has no `window.matchMedia`
  — `useReducedMotion()` calls it on mount. Without the setup stub, every grid
  test dies with `matchMedia is not a function`.

⚠ `staggerChildren` is the legacy API
  — motion 13 uses `delayChildren: stagger(0.025)`. The old form is what most
  training data shows, and it silently does nothing.

⚠ `vite-tsconfig-paths` is load-bearing
  — drop it from the vitest config and every `@/...` import fails to resolve.

⚠ The five tool routes 404
  — deliberate. Do not scaffold stub pages to "fix" it.

⚠ Animation timing is not unit-testable here
  — motion applies transforms on a rAF schedule jsdom does not run
  deterministically. Tests assert rendering and links; timing is checked by eye.

## Out of scope

- Sidebar, navigation, active-state pill, mobile bottom tab bar
- Jobs row and status dots
- "Recent" activity list
- Dashed "New tool" placeholder card
- Status badges and the `--ok` / `--warn` / `--danger` variables
- A working ⌘K command palette
- Stub pages for the five tool routes
- Any persistent lint for design rules
- Playwright or any E2E setup

## Verification

| Command | Green looks like |
|---|---|
| `pnpm -F web test` | `Test Files 2 passed`, `Tests 6 passed` |
| `pnpm -F web typecheck` | no output, exit 0 |
| `pnpm lint` | `Found 0 warnings and 0 errors` |
| `pnpm -F web build` | `✓ Compiled successfully`, `/` listed as a static route |
| grep audit over `src/app` and `src/components/dashboard` | no `shadow-`, `font-semibold`, `font-bold`, bracketed lengths or hex |
| `grep -rn framer-motion` across the repo | no hits |
| `pnpm web:dev`, open `localhost:3000` | cards fade up in sequence on load, hover brightens the border only, single column at 375px |

---

Execution detail: ./steps.md
