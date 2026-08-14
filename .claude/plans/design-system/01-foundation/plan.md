# Design system foundation

**Ships:** `apps/web` builds and renders dark, with shadcn tokens and two primitives available.
**Next:** `../02-tools-index/plan.md`

## Context

`apps/web` has bare create-next-app styling and no design system. This installs
shadcn/ui against Base UI, wires the generated tokens to the Geist fonts the repo
already loads, and commits to a dark-only palette. No page content changes here —
the tools index is the next chunk.

## Decisions settled

| Decision | Chosen | Why |
|---|---|---|
| Primitive library | **Base UI** (`init -b base`) | CLI default in 4.17.0; chosen over radix and aria |
| Preset | **nova** | the only preset pairing Lucide with Geist, which the repo already loads |
| Base colour | **neutral** | ★ stone is unreachable — all 8 presets emit `neutral`, zero chroma. `Custom` opens a web builder and is not scriptable |
| Components pulled | **`card`, `input`** | everything else lost its call site as scope was cut. Each is one `shadcn add` away |
| `globals.css` | as generated, **plus one line** | `--font-mono: var(--font-mono)` in `@theme inline`; nova emits sans and heading mappings but no mono |
| Fonts | Geist + Geist Mono, variables renamed to `--font-sans` / `--font-mono` | shadcn's `@theme inline` looks for those names, not `--font-geist-*` |
| Card edge | `ring-1 ring-foreground/10` → `border` | puts cards on the same `--border` token as `input`, so one hairline treatment covers the UI |
| Dark mode | `className="dark"` on `<html>` + `viewport.colorScheme` | `globals.css` stays byte-identical to generated; adding a toggle later is one line plus `next-themes` |
| Theme toggle | **not built** | dark only for now |
| Status vars `--ok/--warn/--danger` | **dropped** | their only call site was status badges, which were cut |
| Generated file formatting | reformatted by `pnpm fmt` | the CLI writes double quotes and semicolons and bypasses the PostToolUse hook. Two files, so future `shadcn add` churn is negligible |

## Premises corrected

The original request assumed four things that do not hold in shadcn 4.17.0.
Verified by generating the components in a throwaway directory and reading them.

- **`Card` has no `shadow-sm`.** Elevation is `ring-1 ring-foreground/10`.
- **No `font-semibold` in generated source.** `CardTitle` already uses `font-medium`.
- **No `--base-color` flag.** Colour comes from a preset, and all eight are `neutral`.
- **Not Radix.** `-b base` generates against `@base-ui/react`.

## Traps

⚠ `shadcn` lands in `dependencies`, not `devDependencies` — leave it there
  — `globals.css` does `@import "shadcn/tailwind.css"`, so it is needed at build
  time. "Tidying" it into `devDependencies` breaks the production build.

⚠ init installs by itself, and writes the **root** lockfile
  — it appends deps to `apps/web/package.json` and updates `pnpm-lock.yaml` at the
  repo root. Do not pre-install by hand; expect a large root lockfile diff.

⚠ `components.json` `style` and `baseColor` are permanent
  — they cannot be changed after init. Verify both before writing any component code.

⚠ Renaming the font variables is not cosmetic
  — leave them `--font-geist-*` and shadcn's `@theme inline` finds nothing; the page
  silently falls back to a system stack and the mono signature disappears.

## Out of scope

- Theme toggle, `next-themes`, any theme state
- `badge`, `button`, `separator`, `tooltip`, `dropdown-menu`, `skeleton`
- The `--ok` / `--warn` / `--danger` status variables
- Any page content — that is `../02-tools-index/`
- Changing generated token values; the `--font-mono` line is the only permitted addition

## Verification

| Command | Green looks like |
|---|---|
| `pnpm -F web typecheck` | no output, exit 0 |
| `pnpm lint` | `Found 0 warnings and 0 errors` |
| `pnpm fmt:check` | no files listed as unformatted |
| `pnpm -F web build` | `✓ Compiled successfully` |
| `git log --oneline -- apps/web/src/app/globals.css` | exactly two commits: init, then the `--font-mono` line |
| `pnpm web:dev`, open `localhost:3000` | near-black background, one hairline elevation, no light flash on reload |

---

Execution detail: ./steps.md
