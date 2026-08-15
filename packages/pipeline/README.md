# pipeline

Executes a plan under `.claude/plans/<feature>/` by routing each task to the
`tdd` and `worker` agents, gating on real exit codes, and committing per task.

The loop lives in `src/cli.mjs` as ordinary JavaScript. Nothing decides which
agent runs next — the `**Agent:**` line in `steps.md` does.

```
node src/cli.mjs <feature> [--dry-run] [--limit N] [--chunk NAME]
                           [--max-rounds N] [--pr]
```

## What runs

```
for each task in steps.md:
    tdd agent      (only when **Agent:** names it)
    worker agent   ──┐
    gates            │ up to --max-rounds
    failed? ─────────┘
    passed? → tick the checkboxes → git commit
--pr → git push && gh pr create
```

## Gates

Deterministic. Run by this process, branched on by exit code — no model
involved.

| Gate | Skipped when |
|---|---|
| `pnpm -F web test` | `apps/web` has no `test` script |
| `pnpm -F web typecheck` | no `typecheck` script |
| `pnpm lint` | root has no `lint` script |

`pnpm fmt:check` is deliberately absent — it is already red on a clean tree.
Formatting is enforced per file by `.claude/hooks/lint-format.sh`, which the
agents inherit through `settingSources`.

## Agents

`.claude/agents/tdd.md` and `worker.md` are the source of truth. Their bodies
are appended to the `claude_code` system preset; the frontmatter `model:` is
honoured. Editing those files changes agent behaviour with no change here.

Agents run with `permissionMode: 'dontAsk'` — anything not pre-approved is
denied rather than prompting, because nobody is watching.

## State

There is no state file. Everything is read from the plan folder:

| On disk | Meaning |
|---|---|
| `steps.md` empty | not approved — the pipeline stops |
| `- [ ]` | pending |
| `- [x]` | done, skipped on the next run |

Resume is just running the same command again.

## Limits

- Refuses to run on `main`/`master`. Create the branch yourself.
- Each retry round is a fresh session; the previous attempt is passed back as
  text, not as conversation context.
- `--pr` pushes and opens a pull request. Off by default.
