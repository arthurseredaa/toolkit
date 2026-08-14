# home-toolkit

pnpm workspace monorepo. Workspaces: `apps/*`, `packages/*`.

## Installing dependencies

Always install from the **repo root**, targeting the workspace with `-F`:

```
pnpm -F web add <package>          # runtime dep for apps/web
pnpm -F web add -D <package>       # dev dep for apps/web
pnpm add -Dw <package>             # dev dep for the root workspace itself
```

Never `cd apps/web && pnpm add`. Never `npm install` — it writes a
`package-lock.json` alongside `pnpm-lock.yaml` and the two disagree.

Some CLIs install dependencies themselves. `shadcn` detects pnpm correctly
here — it reads the root `pnpm-lock.yaml` and the `packageManager` field, then
adds deps to the target workspace and updates the root lockfile. Let it. For
any unfamiliar CLI, check afterwards that `pnpm-lock.yaml` is still the only
lockfile.

## Tooling

| Concern | Tool | Command |
|---|---|---|
| Lint | oxlint | `pnpm lint` (root, whole repo) |
| Format | oxfmt | `pnpm fmt` / `pnpm fmt:check` |
| Types | tsc | `pnpm -F web typecheck` |
| Build | next | `pnpm -F web build` |

House style (`.oxfmtrc.json`): single quotes, **no semicolons**, 80 cols,
no trailing commas, sorted imports. A `PostToolUse` hook runs
`oxlint --fix` + `oxfmt` on every file written and blocks on leftover
lint errors.

Per-app instructions live in that app's own `CLAUDE.md` / `AGENTS.md`
(e.g. `apps/web/AGENTS.md`).
