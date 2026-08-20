# The pipeline

A briefing for an agent with no access to this repository. Everything needed to
reason about the system is restated here.

## 1. What it is

`packages/pipeline` is a ~650-line Node program that executes a written
implementation plan by handing one task at a time to Claude agents, then
verifying the result with real shell commands.

Three properties define it:

1. **The control flow is ordinary JavaScript.** No model decides what runs
   next. A `for` loop walks tasks, an `if` branches on an exit code.
2. **Routing is data.** Which agent handles a task is a line of markdown in the
   plan (`**Agent:** tdd -> worker`), not a runtime judgement.
3. **Acceptance is deterministic.** A task is accepted only when `pnpm test`,
   `pnpm typecheck` and `pnpm lint` exit 0. The model never grades itself.

It is a plan executor, not an autonomous coding agent. It cannot decide what to
build; it can only execute a plan a human already approved.

## 2. Runtime facts

| Fact | Value |
|---|---|
| Language | Node ESM (`.mjs`), no build step, no TypeScript |
| Only dependency | `@anthropic-ai/claude-agent-sdk` |
| Entry point | `packages/pipeline/src/cli.mjs` |
| Invocation | `pnpm run-plan <feature> [flags]` from the repo root |
| Host repo | a pnpm workspace monorepo: `apps/*`, `packages/*` |

Source files and their single responsibility:

| File | Owns |
|---|---|
| `cli.mjs` | argument parsing, the task loop, all logging |
| `plan.mjs` | parsing `steps.md` into tasks, ticking checkboxes |
| `agent.mjs` | loading an agent definition, one SDK `query()` call |
| `gates.mjs` | `sh()`, gate resolution, gate execution |
| `policy.mjs` | `decideNext()` — accept / retry / stop |
| `git.mjs` | branch guard, per-task commit, PR creation |

## 3. The on-disk contract

A plan lives under `.claude/plans/<feature>/`. Two shapes are supported.

**Chunked** (normal). Each subdirectory is a chunk, executed in
lexicographic order, which is why they carry numeric prefixes:

```
.claude/plans/paywall-remover/
  01-extraction/
    plan.md      # decisions and rationale — read by the agent, never parsed
    steps.md     # the executable task list — parsed
  02-library/
    plan.md
    steps.md
  03-reader-ui/
    plan.md
    steps.md
```

**Flat.** If `steps.md` sits directly in the feature directory, the whole plan
is one chunk named `flat` and any subdirectories are ignored.

`plan.md` is optional. When present, its path is injected into every prompt for
that chunk with the instruction to read it first.

## 4. `steps.md` grammar

The parser recognises exactly three patterns. Everything else is prose that
travels to the agent untouched.

| Pattern | Regex | Meaning |
|---|---|---|
| Task heading | `^##\s+Task\s+(\d+)\s*[—-]\s*(.+)$` | starts a task |
| Agent line | `^\*\*Agent:\*\*\s*(.+)$` | routing for that task |
| Checkbox | `^(\s*)- \[([ x])\]\s` | completion state |

A task's body runs from its `## Task N — Title` heading to the next `##`
heading of any kind. That whole slice is pasted verbatim into the agent prompt.

The agent line splits on `->` or `→` and lowercases each part. When absent it
defaults to `worker`.

```markdown
## Task 1 — Types and URL normalization

**Agent:** tdd -> worker

**Goal:** ...
**Files:** ...
**The test that proves it:** ...
**Verify:** `pnpm -F web test src/lib/paywall-remover/normalize.test.ts`

- [ ] `types.ts` and `normalize.ts` exist, tests green
```

Two consequences that are easy to get wrong:

- **A task with no checkbox is never "done".** Completion is
  `boxes.length > 0 && boxes.every(done)`. A task without a checkbox re-runs on
  every invocation, forever.
- **The `worker` stage always runs.** The agent line is only consulted to decide
  whether `tdd` runs first. Writing `**Agent:** tdd` does not suppress the
  worker.

## 5. Approval

A chunk is approved when its `steps.md` is non-empty and contains at least one
task. An empty `steps.md` is the deliberate signal that a human has not signed
off on the plan yet.

Hitting an unapproved chunk **stops the entire run**, it does not skip ahead:

```
stopping: 02-library has no approved steps.md
```

## 6. The execution loop

```
startup
  git rev-parse --show-toplevel        -> repo root
  .claude/plans/<feature> exists?      -> else exit 66
  assert branch is not main/master     -> skipped under --dry-run
  parse every chunk, print the plan and the gate readiness table

for each chunk (sorted):
  chunk approved?  -> no: stop the run
  for each task not already ticked:

      if agents include "tdd":
          run tdd agent   -> non-zero result ends the run
          keep its report text

      round = 1 .. --max-rounds:
          run worker agent (fresh session each round)
          run every gate
          decideNext(gateRun, round, maxRounds)
              accept -> leave the loop
              retry  -> carry a hint into the next round
              stop   -> end the run

      tick every checkbox in steps.md
      git add -A && git commit -m "feat: <task title>"

if --pr:
  git push -u origin HEAD && gh pr create
```

## 7. What an agent actually receives

The prompt is assembled in `taskPrompt()` and is the same shape for both
agents:

```
You are executing one task from <abs path to steps.md>.
Decisions for this chunk live in <abs path to plan.md>. Read it first.

The task, verbatim:

<the full markdown slice of the task>

<per-stage extra>

Do only this task. Do not start the next one.
```

The per-stage extra:

| Stage | Extra content |
|---|---|
| tdd | "Write only the failing test for this task. Never write implementation code. Report the verbatim runner output." |
| worker, round 1 | the tdd agent's final report, if tdd ran |
| worker, round 2+ | the tdd report, plus `$ <cmd>` and full output for every gate that failed or was skipped, plus the policy hint |

Retries do not continue a conversation. Each round is a brand-new session; the
previous attempt survives only as text pasted into the new prompt.

## 8. How an agent is run

`.claude/agents/<name>.md` is the agent's contract. The file is split on its
YAML frontmatter: `model:` is read from the frontmatter, and the entire markdown
body becomes a system-prompt append.

```js
query({
  prompt,
  options: {
    cwd: repoRoot,
    settingSources: ['user', 'project'],
    systemPrompt: { type: 'preset', preset: 'claude_code', append: body },
    allowedTools: ['Read','Write','Edit','Bash','Grep','Glob','TodoWrite'],
    permissionMode: 'dontAsk',
    model,          // from frontmatter
    maxTurns: 60
  }
})
```

- `permissionMode: 'dontAsk'` denies anything not pre-approved instead of
  prompting. Nobody is watching an unattended run.
- `settingSources: ['user', 'project']` pulls in `CLAUDE.md`, project skills,
  deny rules, and the `PostToolUse` hook that runs `oxlint --fix` + `oxfmt` on
  every file an agent writes.
- A run is successful when the SDK result message has
  `subtype === 'success' && !is_error`.
- Editing the agent markdown changes behaviour with no code change.

The two agents:

| Agent | Model | Mandate |
|---|---|---|
| `tdd` | opus | Write the failing test. Never write implementation code, not even a stub. Confirm the failure is an assertion failure, not a missing module. Report verbatim runner output. |
| `worker` | sonnet | Make it green with the minimum change. Never edit a test to make it pass. Never touch git. Paste the output of every check it ran. |

## 9. Gates

Gates are shell commands run by the Node process. Their exit code is the only
signal.

| Gate | Command | Present when |
|---|---|---|
| test | `pnpm -F web test` | `apps/web/package.json` has a `test` script |
| typecheck | `pnpm -F web typecheck` | `apps/web/package.json` has a `typecheck` script |
| lint | `pnpm lint` | root `package.json` has a `lint` script |

Statuses: `passed`, `failed`, `skipped` (script does not exist), `dry-run`.

Gates are re-resolved **every round**, not once at startup, because a task may
add the very script a gate runs. Resolving once would freeze that gate as
`skipped` for the whole process.

`pnpm fmt:check` is deliberately not a gate: it is already red on a clean tree
(62 vendored files fail). Formatting is enforced per file by the `PostToolUse`
hook instead.

## 10. Policy

`decideNext()` is a pure function, the single place where "keep going" is
decided. Both `failed` and `skipped` are blocking.

```js
const BLOCKING = new Set(['failed', 'skipped'])

decideNext({ gateRun, round, maxRounds })
  no blocking gates          -> { action: 'accept' }
  round >= maxRounds         -> { action: 'stop', reason }
  otherwise                  -> { action: 'retry', hint }
```

The hint names the failing gates. When one is `skipped` it adds that a skipped
gate means the `package.json` script does not exist yet, so the agent should add
it rather than work around it.

Because `dry-run` is not in `BLOCKING`, a `--dry-run` pass accepts every task.

## 11. Commit, tick, PR

- Checkboxes are ticked **before** the commit, so the tick lands in the same
  commit as the code.
- Commit subject is always `feat: <task title>`. Staging is `git add -A`.
- A clean tree after an accepted task is not an error; the commit is reported as
  `skipped (clean tree)`.
- `--pr` runs `git push -u origin HEAD` then `gh pr create` with title
  `feat: <feature>`. Off by default, and unreachable if the run stopped early or
  hit `--limit`.
- The pipeline refuses to run on `main` or `master` unless `--allow-main` is
  passed. Creating the branch is left to the engineer on purpose.

## 12. CLI

```
node packages/pipeline/src/cli.mjs <feature> [flags]
pnpm run-plan <feature> [flags]
```

| Flag | Default | Effect |
|---|---|---|
| `--dry-run` | off | no model calls, no writes, no commits, no branch check |
| `--limit N` | ∞ | stop after N tasks in this invocation |
| `--chunk NAME` | all | run only the chunk directory with this exact name |
| `--max-rounds N` | 3 | worker attempts per task before `stop` |
| `--pr` | off | push and open a pull request at the end |
| `--allow-main` | off | permit running on the default branch |

A bare `--` is swallowed, so `pnpm run-plan -- <feature>` works.

Exit codes: `64` no feature argument, `66` no plan directory, `1` a task
stopped or an exception was thrown, `0` otherwise.

## 13. State and resume

There is no state file, no run id, no lock. Every fact is read from the plan
directory:

| On disk | Meaning |
|---|---|
| `steps.md` empty | not approved, the pipeline stops |
| `- [ ]` | pending |
| `- [x]` | done, skipped on the next run |

Resume is re-running the same command. On failure the run prints the chunk and
task it stopped at, leaves the working tree dirty for inspection, commits
nothing, and sets exit code 1.

## 14. Deliberate non-features

Knowing what it refuses to do prevents wrong assumptions:

- No parallelism. One task at a time, in order.
- No rollback. A failed task leaves its partial work in the tree.
- No conversational memory across retries.
- No model involvement in accept/reject.
- No worktree isolation. It runs in the checkout it was invoked from.
- No plan authoring. Plans are written and approved outside the pipeline.
- No `--base` handling or PR stacking.
