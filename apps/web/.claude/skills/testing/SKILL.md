---
name: testing
description: How to write and run tests in apps/web (Next.js App Router + React). Use when writing, running, or bootstrapping tests for any file under apps/web — component tests, hook tests, utility tests. Covers the runner, conventions, and what cannot be unit-tested here.
---

# Testing — apps/web

The test surface for the Next.js app. Every rule below is specific to *this*
app; other apps and packages carry their own `testing` skill scoped to their own
directory.

## Stack facts

| Thing | Value |
|---|---|
| Framework | Next.js 16.3.0, App Router (`apps/web/src/app/`) |
| React | 19.2.8, **React Compiler enabled** (`apps/web/next.config.ts:5`) |
| TypeScript | `strict: true`, `noEmit: true` (`apps/web/tsconfig.json`) |
| Path alias | `@/*` → `./src/*` |
| Runner | **Vitest** + React Testing Library, jsdom |
| Format | oxfmt: single quotes, no semicolons, 80 cols, sorted imports |

★ Read `apps/web/node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`
before changing anything about the setup. This Next version differs from
training data; that file is the authority.

## Bootstrap — only if vitest is absent

Check first: `ls apps/web/node_modules/.bin/vitest`. If it exists, skip this
whole section.

If it does not, run exactly this — the command comes from the bundled Next doc
above, not from memory:

```
pnpm -F web add -D vitest @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/dom vite-tsconfig-paths
```

Create `apps/web/vitest.config.mts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: { environment: 'jsdom' }
})
```

Add to `apps/web/package.json` scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

`vite-tsconfig-paths` is what makes `@/components/x` resolve in tests. Without
it every aliased import fails with `Cannot find module` and you will waste a
cycle blaming the test.

## Running

```
pnpm -F web test              # all tests, single run
pnpm -F web test <pattern>    # filter by filename
pnpm -F web exec tsc --noEmit # types
```

CI-style single run is `vitest run`. Never leave watch mode running in an agent
session — it never exits.

## Conventions

- **Location:** colocate `Foo.test.tsx` next to `Foo.tsx`. `__tests__/` is
  acceptable for tests that cover several files at once.
- **Query by role.** `getByRole('button', { name: 'Save' })` over
  `getByTestId` over `querySelector`. If a role query is impossible, the markup
  usually has an accessibility problem worth fixing instead.
- **One behavior per test.** Name it as a sentence about behavior:
  `it('disables submit while the form is pending')`, not `it('works')`.
- **Do not mock what you own.** Mock the network boundary and the clock.
  Mocking your own module means the test asserts your mock, not your code.
- **No snapshot tests** unless explicitly asked. They pass forever and prove
  nothing.
- **Format** is enforced automatically — the `PostToolUse` hook at
  `.claude/hooks/lint-format.sh` runs `oxlint --fix` and `oxfmt` on every file
  written, and blocks on leftover lint errors. Write in house style anyway:
  single quotes, no semicolons.

## What cannot be tested here

⚠ **`async` Server Components cannot be unit-tested with Vitest.**

Next's own guide is explicit: *"Since `async` Server Components are new to the
React ecosystem, Vitest currently does not support them. While you can still
run unit tests for synchronous Server and Client Components, we recommend using
E2E tests for `async` components."*

| Component kind | Unit-testable |
|---|---|
| Client Component (`'use client'`) | yes |
| Synchronous Server Component | yes |
| **`async` Server Component** | **no — needs E2E** |

When the target is an `async` Server Component: **report that and stop.** Do not
mock the async boundary, do not convert it to a client component to make it
testable, do not extract a fake sync wrapper. Any of those makes the test lie
about what ships. Say the file needs E2E coverage and name it.

There is no Playwright setup in this repo yet. Adding one is a separate,
deliberate decision — not something to bootstrap silently mid-task.

## Adding a new surface

When `apps/api`, or a `packages/*` library, or a mobile app appears, give it its
own directory-scoped skill at `<that-dir>/.claude/skills/testing/SKILL.md` with
the same four sections:

1. **Stack facts** — what it is, what version, what config
2. **Bootstrap** — exact install commands, sourced from that stack's own docs
3. **Conventions** — location, queries, naming, mocking policy
4. **What cannot be tested** — the honest limits

Keep the skill named `testing`. Scoping does the routing; no agent needs
editing when a new surface appears.
