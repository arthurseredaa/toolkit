Decisions: ./plan.md

# Tools index — steps

Requires `../01-foundation/` to be done. Run from the repo root.
**Commit after each task** as `feat(web): <what>` / `test(web): <what>`.
Not repeated below.

---

## Task 1 — Bootstrap Vitest

**Agent:** worker

**Creates:** `apps/web/vitest.config.mts`, `apps/web/vitest.setup.ts`
**Modifies:** `apps/web/package.json`

Setup taken from `apps/web/node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`.

- [x] **1.1** ~~install~~ — **already done.** Landed: `vitest@4.1.10`,
      `@vitejs/plugin-react@6.0.5`, `jsdom@30.0.1`, `@testing-library/react@16.3.2`,
      `@testing-library/dom@10.4.1`, `vite-tsconfig-paths@6.1.1`. Only the config
      files below remain.

- [x] **1.2** `apps/web/vitest.config.mts`:

```ts
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts']
  }
})
```

- [x] **1.3** `apps/web/vitest.setup.ts`:

```ts
import { beforeEach } from 'vitest'

export function setMatchMedia(prefersReducedMotion: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion')
        ? prefersReducedMotion
        : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    })
  })
}

beforeEach(() => {
  setMatchMedia(false)
})
```

- [x] **1.4** Add to `apps/web/package.json` scripts:
      `"test": "vitest run"`, `"test:watch": "vitest"`

- [x] **1.5** `pnpm -F web test` → starts, reports no test files.

---

## Task 2 — Tool data

**Agent:** worker

**Creates:** `apps/web/src/components/dashboard/tools.ts`

No unit test of its own — a static literal with no logic. Its contents are
asserted by Task 3, where a typo would actually fail.

- [x] **2.1**

```ts
export type Tool = {
  slug: string
  name: string
  description: string
  stat: string
}

export const tools: Tool[] = [
  { slug: 'faq', name: 'FAQ', description: 'Fixes I keep forgetting', stat: '142 entries' },
  { slug: 'compress', name: 'Compress', description: 'Batch resize and convert', stat: '1.2k processed' },
  { slug: 'vinted', name: 'Vinted', description: 'Listings and profit', stat: '38 active' },
  { slug: 'links', name: 'Links', description: 'Short links, click stats', stat: '214 clicks' },
  { slug: 'analytics', name: 'Analytics', description: 'Daily channel snapshots', stat: 'synced 2h ago' }
]
```

---

## Task 3 — Tool grid (client island)

**Agent:** tdd -> worker

**Creates:** `apps/web/src/components/dashboard/tool-grid.tsx` + `.test.tsx`

**The test that proves it:** all five tools render as links to their own routes,
and the grid still renders when reduced motion is preferred.

- [x] **3.1** Write the failing test — `tool-grid.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { setMatchMedia } from '../../../vitest.setup'
import { ToolGrid } from './tool-grid'
import { tools } from './tools'

describe('ToolGrid', () => {
  it('renders one link per tool', () => {
    render(<ToolGrid tools={tools} />)
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })

  it('links each tool to its own route', () => {
    render(<ToolGrid tools={tools} />)
    expect(
      screen.getByRole('link', { name: /compress/i }).getAttribute('href')
    ).toBe('/compress')
    expect(
      screen.getByRole('link', { name: /analytics/i }).getAttribute('href')
    ).toBe('/analytics')
  })

  it('shows the name, description and stat for a tool', () => {
    render(<ToolGrid tools={tools} />)
    expect(screen.getByText('Vinted')).toBeDefined()
    expect(screen.getByText('Listings and profit')).toBeDefined()
    expect(screen.getByText('38 active')).toBeDefined()
  })

  it('still renders every tool when reduced motion is preferred', () => {
    setMatchMedia(true)
    render(<ToolGrid tools={tools} />)
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })
})
```

- [x] **3.2** `pnpm -F web test tool-grid` → FAIL, cannot resolve `./tool-grid`

- [x] **3.3** `pnpm -F web add motion` — the package is `motion`, never `framer-motion`

- [x] **3.4** `tool-grid.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { motion, stagger, useReducedMotion } from 'motion/react'

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { Tool } from './tools'

const container = {
  hidden: {},
  visible: { transition: { delayChildren: stagger(0.025) } }
}

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: 'easeOut' as const }
  }
}

export function ToolGrid({ tools }: { tools: Tool[] }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.ul
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      variants={reduceMotion ? undefined : container}
      initial={reduceMotion ? false : 'hidden'}
      animate={reduceMotion ? false : 'visible'}
    >
      {tools.map((tool) => (
        <motion.li key={tool.slug} variants={reduceMotion ? undefined : item}>
          <Link
            href={`/${tool.slug}`}
            className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="h-full transition-colors hover:border-foreground/20">
              <CardHeader>
                <CardTitle>{tool.name}</CardTitle>
                <CardDescription>{tool.description}</CardDescription>
              </CardHeader>
              <div className="px-(--card-spacing) font-mono text-xs text-muted-foreground">
                {tool.stat}
              </div>
            </Card>
          </Link>
        </motion.li>
      ))}
    </motion.ul>
  )
}
```

- [x] **3.5** `pnpm -F web test tool-grid` → 4 passed

---

## Task 4 — The page

**Agent:** tdd -> worker

**Modifies:** `apps/web/src/app/page.tsx`
**Creates:** `apps/web/src/app/page.test.tsx`
**Deletes:** `apps/web/public/*.svg`

**The test that proves it:** the search field, the ⌘K hint and all five tool
links render from one synchronous Server Component.

- [x] **4.1** Write the failing test — `page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import Home from './page'

describe('Home', () => {
  it('renders a search field', () => {
    render(<Home />)
    expect(
      screen.getByRole('searchbox', { name: /search tools/i })
    ).toBeDefined()
  })

  it('shows the keyboard shortcut hint', () => {
    render(<Home />)
    expect(screen.getByText('⌘K')).toBeDefined()
  })

  it('renders the full tool index', () => {
    render(<Home />)
    expect(screen.getAllByRole('link')).toHaveLength(5)
  })
})
```

- [x] **4.2** `pnpm -F web test page` → FAIL

- [x] **4.3** Replace `page.tsx`:

```tsx
import { ToolGrid } from '@/components/dashboard/tool-grid'
import { tools } from '@/components/dashboard/tools'
import { Input } from '@/components/ui/input'

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <div className="relative mb-10">
        <Input
          className="h-9 pr-12"
          type="search"
          placeholder="Search tools…"
          aria-label="Search tools"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-muted-foreground">
          ⌘K
        </span>
      </div>

      <ToolGrid tools={tools} />
    </main>
  )
}
```

No `'use client'` — `ToolGrid` is the only client island.

- [x] **4.4** `pnpm -F web test` → 7 passed across 2 files

- [x] **4.5** `rm apps/web/public/*.svg` — create-next-app leftovers

---

## Task 5 — Design-rule audit

**Agent:** worker

- [x] **5.1** From `apps/web`, each must report nothing:

```bash
grep -rnE 'shadow-|font-semibold|font-bold' src/app src/components/dashboard
grep -rnE '\[[0-9.]+(px|rem|em)\]|\[#[0-9a-fA-F]{3,8}\]' src/app src/components/dashboard
```

`src/components/ui/` is excluded on purpose — generated code, and `input.tsx`
legitimately uses bracket syntax.

- [x] **5.2** From the repo root:

```bash
grep -rn framer-motion --include='*.ts' --include='*.tsx' --include='*.json' apps packages package.json
find . -name package-lock.json -not -path './node_modules/*'
ls apps/web/tailwind.config.*
```

- [x] **5.3** Run the Verification table in `./plan.md`, including the browser checks.
