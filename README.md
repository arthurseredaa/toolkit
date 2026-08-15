# toolkit

Small web tools — and an experiment in building them without writing the code
by hand.

## How work happens here

    plan  ──►  tdd agent  ──►  worker agent  ──►  gates  ──►  commit
     you       writes the      makes it           test
               failing test    pass               lint
                                                  typecheck

A plan lives in `.claude/plans/<feature>/`. `packages/pipeline` reads it and
runs each task through the agents.

Which agent handles a task is written in the plan, not decided at runtime. The
loop is plain JavaScript, so the same plan always produces the same sequence of
agents.

The gates are real commands, branched on by exit code. Nothing asks a model
whether the tests passed.

## Layout

| Path | What |
|---|---|
| `apps/web` | the tools |
| `packages/pipeline` | the runner |
| `.claude/` | agents, skills, plans |

## Commands

    pnpm web:dev              start the web app
    pnpm lint                 oxlint, whole repo
    pnpm fmt                  oxfmt

    pnpm run-plan <feature> --dry-run     what it would do, no model calls
    pnpm run-plan <feature> --limit 1     run one task, then stop

Run from the repo root, or add `-w` from anywhere: `pnpm -w run-plan …`
