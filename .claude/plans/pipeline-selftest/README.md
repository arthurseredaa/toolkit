# Pipeline self-test — read this before touching the folder

⚠ **`plan.md` and `steps.md` in here are deliberately wrong.** They are
  not a feature. Nothing in `apps/web/src/lib/selftest/` should ever be
  merged, and it is expected to be deleted after every run.

This folder exists to force the pipeline down one specific path on
demand:

```
decideNext -> stop -> reviewer -> verdict `plan` -> issues.md -> halt
```

Without it that path only happens by accident, when a real plan turns
out to assert something untrue — which is not something you can schedule
around while testing the reviewer.

**This file is invisible to the pipeline.** `loadChunk`
(`packages/pipeline/src/plan.mjs`) reads only `steps.md` and `plan.md`,
and `reviewPrompt` hands the reviewer the task body plus `plan.md`. The
warning lives here, apart from both, on purpose: a reviewer told the
plan is a fake would reach the right verdict for the wrong reason, and
the run would prove nothing.

## The planted defect

`plan.md` claims, as plain fact, that `client-zip`'s `predictLength`
returns a `number`. It returns `bigint`:

```
node_modules/client-zip/index.d.ts
export declare function predictLength(files: Iterable<…>): bigint
```

That single false premise turns two gates red at once — `typecheck` on
the declared return type, `test` on `toBe(120)` against a `bigint` —
while `lint` stays green, so the failure signal stays narrow.

## Running it

```
git checkout -b test/pipeline-selftest
pnpm run-plan pipeline-selftest --max-rounds 1
```

`--max-rounds 1` is the lever: `policy.mjs` returns `stop` as soon as
`round >= maxRounds` with a blocking gate, so the reviewer fires after
one worker round instead of three. Cost is one tdd call, one worker
call, one reviewer call.

## What a passing run looks like

| Expected | Where |
|---|---|
| `failed` on typecheck and test, `passed` on lint | gates block |
| `policy   stop — … after 1 rounds` | `policy.mjs` |
| `success · plan` | reviewer verdict |
| `STOPPED at flat task 1 (plan)` | `cli.mjs` |
| `issues.md` quoting `index.d.ts` and the word `bigint` | `writeIssues` |
| no new commit, checkbox still `- [ ]` | halt beat `tickTask` |

A verdict with no quoted evidence is a finding about `reviewer.md`, not
a pass. So is a green run: it means the worker ignored a verbatim
instruction to reach it.

## Cleanup

```
git checkout feat/pipeline-reviewer
git branch -D test/pipeline-selftest
git clean -fd apps/web/src/lib/selftest .claude/plans/pipeline-selftest
git checkout -- .
```

`git clean` removes what the run generated — the `selftest` sources and
`issues.md`. The committed fixture survives.
