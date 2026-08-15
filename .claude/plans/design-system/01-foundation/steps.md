Decisions: ./plan.md

# Foundation — steps

Run everything from the repo root unless a step says otherwise.
**Commit after each task** as `feat(web): <what>`. Not repeated below.

---

## Task 1 — Initialise shadcn, pull card and input

**Agent:** worker

**Creates:** `apps/web/components.json`, `apps/web/src/lib/utils.ts`,
`apps/web/src/components/ui/{card,input}.tsx`
**Rewrites:** `apps/web/src/app/globals.css`

No unit test — this runs a code generator. The checks below are the proof.

- [ ] **1.1** `cd apps/web && pnpm dlx shadcn@latest init -b base -p nova -y`

- [ ] **1.2** Confirm it used pnpm: `git status` shows a large `pnpm-lock.yaml`
      diff at the repo root and **no** `package-lock.json`. Detection relies on
      the root `pnpm-lock.yaml` plus the `packageManager` field — both present.

- [ ] **1.3** Read `apps/web/components.json`. Required values:
      `"style": "base-nova"`, `"baseColor": "neutral"`, `"rsc": true`.
      Wrong? Delete the file and rerun 1.1 with `-f` — these are permanent.

- [ ] **1.4** `cd apps/web && pnpm dlx shadcn@latest add card input -y`

- [ ] **1.5** `ls apps/web/tailwind.config.*` → must not exist.

- [ ] **1.6** `pnpm fmt` — the CLI writes double quotes and semicolons.

---

## Task 2 — Map the mono font

**Agent:** worker

**Modifies:** `apps/web/src/app/globals.css`

No unit test — CSS custom property registration is not observable from jsdom.
Proven by the build and by eye.

- [ ] **2.1** In the `@theme inline` block, directly under the two existing font
      lines, add:

```css
    --font-mono: var(--font-mono);
```

- [ ] **2.2** `git diff --stat apps/web/src/app/globals.css`
      → `1 file changed, 1 insertion(+)`. Any deletion means a token value moved; revert.

---

## Task 3 — Card gets a border

**Agent:** worker

**Modifies:** `apps/web/src/components/ui/card.tsx`

No unit test — one class substitution with no behavioural surface.

- [ ] **3.1** In the `Card` function only, replace

```
rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10
```

with

```
rounded-xl border bg-card py-(--card-spacing) text-sm text-card-foreground
```

- [ ] **3.2** `grep -c 'ring-foreground/10' apps/web/src/components/ui/card.tsx` → 0

---

## Task 4 — Dark-only root layout

**Agent:** worker

**Modifies:** `apps/web/src/app/layout.tsx`

No unit test — fonts, metadata and viewport are Next runtime chrome with no
rendered behaviour RTL can assert. Proven by the build.

- [ ] **4.1** Replace the file:

```tsx
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import './globals.css'

const geistSans = Geist({ variable: '--font-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'toolkit',
  description: 'Small tools I keep coming back to'
}

export const viewport: Viewport = {
  colorScheme: 'dark'
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  )
}
```

`LayoutProps<'/'>` is a Next 16 generated type — keep it, do not hand-write
`{ children: React.ReactNode }`.

- [ ] **4.2** `pnpm -F web typecheck`

---

## Done

Run the Verification table in `./plan.md`. The page still shows create-next-app
boilerplate at this point — that is expected; `../02-tools-index/` replaces it.
