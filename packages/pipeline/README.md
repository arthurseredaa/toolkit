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
    out of rounds? → reviewer agent
        verdict plan           → issues.md, run stops for a human
        verdict implementation → its reasoning becomes one bonus round
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

`.claude/agents/tdd.md`, `worker.md` and `reviewer.md` are the source of
truth. Their bodies are appended to the `claude_code` system preset; the
frontmatter `model:` is honoured. Editing those files changes agent behaviour
with no change here.

The reviewer is the exception to the shared tool list: it runs with
`READ_ONLY_TOOLS` and answers a JSON schema, so it can diagnose a stuck task
but cannot touch the tree it is diagnosing.

`.claude/plans/pipeline-selftest/` is a fixture whose plan is deliberately
false, so the reviewer's `plan` verdict can be rehearsed on demand:

```
git checkout -b test/pipeline-selftest
pnpm run-plan pipeline-selftest --max-rounds 1
```

Its README says what a passing run looks like and how to clean up.

⚠ **The other verdict has no fixture.** `implementation` → one bonus round
  has never run end to end, because a task hard enough to fail a round is
  also a task the worker usually just finishes, and then policy returns
  `accept` before the reviewer is ever called.

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
- Gates are repo-wide, not task-scoped. One unrelated red test anywhere in
  `apps/web` makes every task unacceptable, so the run stops on a failure it
  did not cause. Check `pnpm -F web test` is green before starting.
