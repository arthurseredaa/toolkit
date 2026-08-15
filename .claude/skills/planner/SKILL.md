---
name: planner
description: Use when the user wants a plan, spec, or design for multi-step work — "plan this", "how should we build X", "think this through", "design the approach", "write a spec", or before any feature that touches more than one file or needs decisions settled before code.
---

# Planner

Turn a vague request into a plan someone else can execute without asking you
anything. Two phases, in this order, no overlap:

1. **Interview** — grill until the design tree is walked.
2. **Write** — only after the user confirms shared understanding.

## 1. Invoke `grilling` first

Non-negotiable. Invoke the `grilling` skill before your first question. It owns
the interview protocol — one question at a time, the gate, what does and does
not count as confirmation. This skill owns only the *output shape*.

Do not paraphrase grilling's rules from memory. Invoke it.

## 2. Facts are yours. Decisions are theirs.

Never ask the user something the environment can answer.

| Question | Who answers it |
|---|---|
| "Does this repo use vitest?" | You — go look |
| "What's the current auth flow?" | You — go read it |
| "Which package owns this?" | You — go find it |
| "Should errors surface as toasts or inline?" | **The user** |
| "Is offline support in scope?" | **The user** |

Dispatch `Explore` subagents for facts — up to 3 in parallel, in a single
message, each with a distinct search focus. A running exploration is an
unsettled prerequisite: ask the rest of the frontier now, and hold only the
questions that depend on it.

## 3. Docs discipline

Training data lags. Before planning against any library:

- **Libraries, frameworks, SDKs, CLIs** →
  `npx ctx7@latest library <name> "<the full question>"` then
  `npx ctx7@latest docs <libraryId> "<the full question>"`.
- **Next.js** → read `apps/web/node_modules/next/dist/docs/`. This repo pins
  Next 16.3.0, whose APIs differ from training data; `apps/web/AGENTS.md` says
  so explicitly. The bundled docs are the authority, not your memory.

A plan built on a hallucinated API is worse than no plan.

## 4. The decision ladder

Before any step enters the plan, stop at the first rung that applies:

1. Does this need to exist? → no: cut it
2. Already in this codebase? → reuse it
3. Standard library does it? → use it
4. Native platform feature? → use it
5. Already-installed dependency? → use it
6. One line? → one line
7. Only then: the minimum that works

Reading existing code beats writing new code. A step that survives the ladder
is a step worth planning.

## 5. The affordance rule

Anything that *looks* usable must say what happens when someone uses it — a key
hint, a button, a clickable-looking icon, a search placeholder, an empty-state
call to action.

Every one gets a row in **Decisions settled**, and that row has exactly two
legal answers:

| Answer | What it obliges |
|---|---|
| It works | a step in `steps.md`, and a test that **presses** it — not one that renders it |
| It is not shipped | do not render it |

★ **"It renders but does nothing" is not a legal answer.** No gate catches it.
`test`, `typecheck` and `lint` all verify conformance to the plan, so a plan
that asks for a dead control yields a test asserting the dead control renders,
and it passes. The class is invisible to them by construction.

`.claude/plans/design-system/02-tools-index/plan.md:23` settled a ⌘K hint as a
"non-functional mono span", reasoning that *nothing should explain a shortcut
that does nothing* — then kept the shortcut and dropped only the tooltip. Every
gate went green and the dead key reached the browser.

## 6. The gate

**Do not write the plan file until the user confirms shared understanding.**

A written plan pre-commits the branches you have not walked. Grilling's "these
are not confirmation" table applies to the file write exactly as it applies to
implementation: "just go", "you know how this goes", "not much left to decide",
and "that all sounds right" are not confirmation.

Reading, searching, and read-only commands are always fine during the
interview. Prefer them.

## 7. Two files, two readers

**Never put both audiences in one file.** They want opposite things, and the
executor's material always wins on volume — a single file ends up ~90% code the
approver scrolls past to find the four sections meant for them.

| File | Reader | Budget |
|---|---|---|
| `plan.md` | the human deciding approve/reject | **≤ 80 lines. No implementation code.** |
| `steps.md` | the `worker` / `tdd` agent executing | as long as it needs |

### Layout

One folder per feature. No date in the name — git commits carry dates.

```
.claude/plans/<feature>/
├── plan.md
└── steps.md
```

Flat until it outgrows the budget. Only then split:

```
.claude/plans/<feature>/
├── 01-foundation/{plan,steps}.md
└── 02-index-page/{plan,steps}.md
```

Scaffold it — do not hand-create the folder:

```
.claude/skills/planner/new-plan.sh <feature> [chunk]
```

It writes `plan.md` from `templates/plan.md` and an empty `steps.md`. It refuses
if a plan is already there; when it refuses, **ask the user** rather than
overwriting or inventing a new name.

### Two gates

| Gate | Rule |
|---|---|
| 1 | No plan file at all until the interview is confirmed (see §6). |
| 2 | **No `steps.md` until the user has read and approved `plan.md`.** |

Gate 2 exists because the verbose file is the expensive one. Writing it before
approval means throwing it away when a decision changes.

### 80 lines is a decomposition rule, not a formatting rule

Over budget means **the chunk is too big**, not that the prose is too fat.

★ **Split along shippable boundaries.** Never "where does line 81 fall". Ask
what is the smallest thing that independently builds and verifies — each plan
must produce working, testable software on its own.

Same signal, felt earlier: more than ~12 rows in **Decisions settled** means
split. You will hit that before you hit the line count.

### The decision file

Sections are fixed by `templates/plan.md`: Ships/Next, Context, Decisions
settled, Premises corrected, Traps, Out of scope, Verification. Delete
**Premises corrected** if there were none. Add nothing else.

**No implementation code.** Not a snippet, not "just for illustration". If a
decision is unintelligible without code, name the file and line instead.

### The steps file

Numbered tasks. Each carries: goal / exact files / **the test that proves it** /
verification command / the actual code. Follow `superpowers:writing-plans` for
granularity and its no-placeholders rule.

**The "test that proves it" line is a contract**, not decoration — the `tdd`
agent reads it to write the RED test. If a step has no observable behavior to
assert, say so on that line and explain why.

**It must not restate rationale.** No "why we chose this", no decision tables.
Those live in `plan.md`, once. Two copies drift; when they disagree, `plan.md`
wins. Open the file with one line back: `Decisions: ./plan.md`.

## 8. Cutting rules

Both files. Every one of these came from a plan that was rejected as unreadable.

- **Kill `Notes:` blocks that restate adjacent code.** If the code says
  `variable: '--font-sans'`, do not add a note saying the variable is
  `--font-sans`. A note earns its place only by saying what the code cannot: a
  trap, a version gotcha, a reason.
- **Collapse repeated ceremony into one rule.** "Commit after each task as
  `<type>(<scope>): <what>`" stated once at the top beats N identical commit
  steps.
- **Drop `Files to touch` when the steps already name every path.** It is a
  second index of the same facts.
- **State each trap once.** Inline at the step, or in Traps — not both.
- **No expected-output block when failure is self-evident.** Include it only
  where the reader could mistake a failure for success.
- **Check the budget before handing over:** `wc -l` the decision file. Over 80,
  split the chunk (§7) — do not cut content to fit.

## 9. Readability rules

The decision file is read by a human choosing whether to approve. Optimize hard
for that. The steps file follows the same rules wherever they do not fight
completeness.

- **Load-bearing point first.** Supporting detail after it, never before.
- **Never a wall of equal-weight prose.** Three or more findings, options, or
  facts → table or list.
- **Group by where things live** — file, directory, function. Never by invented
  abstract categories.
- **Anchor to code** as `path/to/file.ts:42`. Clickable beats descriptive.
- **Mark the weight.** Bold or ★ for what carries the decision, so the reader
  knows where to look. Navigation, not verdict.
- **One line per finding:** `<file>:L<n>: <what>. <what replaces it>.`
- **No time estimates. No motivational language. No urgency.**
- **No "I'd go with X"** unless asked. Present options with real trade-offs and
  stop. The decision stays theirs.

## Red flags

These mean stop:

| Thought | Reality |
|---|---|
| "I'll sketch the plan file, then keep asking" | That is the gate. A draft is a commitment. |
| "The rest is standard, I can answer it myself" | Standard for you is not decided for them. |
| "I'll just ask whether they use vitest" | That is a fact. Go look. |
| "I remember how this Next API works" | Read `node_modules/next/dist/docs/`. |
| "Batching questions saves them time" | Follow grilling's pacing, not your own. |
| "It's only a visual hint, nobody will actually press it" | Then it must not look pressable. No gate catches this one. |
| "They said go, so the gate is lifted" | Delegation under pressure is not agreement. |
| "One file is simpler than two" | Simpler to write, unreadable to approve. The code drowns the decisions. |
| "This snippet makes the decision clearer" | Then the decision file has code in it. Name the file and line instead. |
| "The steps need the reasoning to make sense" | They need the *what*, not the *why*. Rationale in two places drifts. |
