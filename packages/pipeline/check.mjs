#!/usr/bin/env node
// Did a refactor break the pipeline? Run this.
//
//   pnpm pipeline:check           free: syntax, lint, policy, parser, dry run
//   pnpm pipeline:check --live    the above, then a real run with real models
//
// The free tier cannot reach the reviewer. In a dry run `runGates` reports
// every gate as 'dry-run', which BLOCKING does not contain, so policy always
// returns 'accept' and the stop branch is unreachable by construction. Only
// --live exercises it, and only that tier costs money (~$1, ~3 min).
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { sh } from './src/gates.mjs'
import { loadPlan } from './src/plan.mjs'
import { decideNext } from './src/policy.mjs'

const root = sh('git rev-parse --show-toplevel').out
const src = join(root, 'packages', 'pipeline', 'src')
const live = process.argv.slice(2).includes('--live')

let failures = 0

const section = (s) => console.log(`\n${s}`)

function assert(ok, label, detail) {
  if (ok) return console.log(`  ok   ${label}`)
  failures++
  console.log(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}`)
}

// ── syntax ──────────────────────────────────────────────────────────────
section('syntax')
for (const f of readdirSync(src).filter((f) => f.endsWith('.mjs'))) {
  const r = sh(`node --check ${JSON.stringify(join(src, f))}`)
  assert(r.ok, f, r.ok ? '' : r.out)
}

// ── lint and format ─────────────────────────────────────────────────────
section('lint and format')
for (const cmd of ['npx oxlint packages/pipeline', 'npx oxfmt --check src']) {
  const r = sh(cmd, {
    cwd: cmd.includes('oxfmt') ? join(root, 'packages', 'pipeline') : root
  })
  assert(r.ok, cmd, r.ok ? '' : r.out)
}

// ── policy decision table ───────────────────────────────────────────────
// The one file where a wrong answer is silent: a bad `accept` ticks a task
// that never passed, and a bad `retry` burns rounds. So it gets a table.
section('policy')
const gates = (...statuses) => ({
  results: statuses.map((status, i) => ({
    name: `g${i}`,
    cmd: `cmd${i}`,
    status,
    out: ''
  }))
})

for (const [label, gateRun, round, maxRounds, want] of [
  ['all green', gates('passed', 'passed', 'passed'), 1, 3, 'accept'],
  ['red, rounds left', gates('failed', 'passed'), 1, 3, 'retry'],
  ['red, last round', gates('failed', 'passed'), 3, 3, 'stop'],
  ['skipped blocks too', gates('skipped', 'passed'), 1, 3, 'retry'],
  ['dry-run is not red', gates('dry-run', 'dry-run'), 1, 3, 'accept']
]) {
  const got = decideNext({ gateRun, round, maxRounds })?.action
  assert(got === want, `${label} → ${want}`, got === want ? '' : `got ${got}`)
}

// ── plan parser ─────────────────────────────────────────────────────────
// Parses a steps.md written to a temp dir, so cases stay readable inline.
function parse(steps) {
  const dir = mkdtempSync(join(tmpdir(), 'pipeline-check-'))
  writeFileSync(join(dir, 'steps.md'), steps)
  return loadPlan(dir).chunks[0]
}

section('plan parser')
const plain = parse(`## Task 1 — Something

- [ ] **1.1** do it
`)

assert(plain.approved, 'a steps.md with a task is approved')
assert(plain.tasks.length === 1, 'finds one task')
assert(plain.tasks[0].title === 'Something', 'reads the title')
assert(
  plain.tasks[0].agents.join() === 'worker',
  'defaults to the worker when no **Agent:** line'
)
assert(plain.tasks[0].done === false, 'an unticked box is not done')

// TODO(human): add the cases that decide behaviour, not just shape.
//
// `parse(steps)` returns the chunk — { approved, tasks: [{ number, title,
// agents, boxes, done }] } — and `assert(ok, label)` records the result.
//
// `pendingTasks(plan, { chunk })` is now the only walk of the plan, and it has
// no coverage at all. It takes `{ chunks: [...] }` and returns
// `{ tasks: [{ chunk, task }], blockedBy }`. Assert what it selects.

// ── dry run ─────────────────────────────────────────────────────────────
section('dry run')
const before = sh('git status --porcelain', { cwd: root }).out
const run = sh(
  'node packages/pipeline/src/cli.mjs pipeline-selftest --dry-run',
  {
    cwd: root
  }
)

assert(run.ok, 'exits 0', run.ok ? '' : run.out)
assert(
  run.out.includes('Task 1 [tdd -> worker]'),
  'loads the fixture and its agents'
)
assert(run.out.includes('policy   accept'), 'reaches policy')
assert(
  sh('git status --porcelain', { cwd: root }).out === before,
  'wrote nothing to the tree'
)

// ── live run ────────────────────────────────────────────────────────────
// Everything below spends money and touches git, so it is opt-in. It runs the
// deliberately-false fixture at .claude/plans/pipeline-selftest, which is the
// only way to reach `stop -> reviewer -> verdict plan -> issues.md -> halt`.
const git = (cmd) => sh(cmd, { cwd: root })

// Streams to the terminal and captures at once — a live run is three silent
// minutes otherwise. pipefail keeps the exit code of the pipeline, not tee's.
function runStreaming(cmd) {
  const logPath = join(mkdtempSync(join(tmpdir(), 'pipeline-live-')), 'run.log')
  const r = spawnSync(
    'bash',
    ['-lc', `set -o pipefail; ${cmd} 2>&1 | tee ${JSON.stringify(logPath)}`],
    { cwd: root, stdio: 'inherit' }
  )
  return { code: r.status ?? -1, out: readFileSync(logPath, 'utf8') }
}

if (!live) {
  section('live run')
  console.log('  skipped — pass --live to spend ~$1 and ~3 min on a real run')
} else if (git('git status --porcelain').out.length > 0) {
  section('live run')
  assert(false, 'needs a clean tree', 'commit or stash first, then re-run')
} else {
  const fixture = join(root, '.claude', 'plans', 'pipeline-selftest')
  const origin = git('git rev-parse --abbrev-ref HEAD').out
  const head = git('git rev-parse HEAD').out
  const branch = `pipeline-check/${Date.now()}`

  section('live run')
  console.log(`  branch  ${branch}  (deleted afterwards)`)
  console.log(`  return  ${origin}\n`)

  let real = null
  // The verdict lives in a file the cleanup below deletes, so read it inside
  // the try or lose the one assertion that checks the reviewer's evidence.
  let issues = null

  try {
    git(`git checkout -q -b ${branch}`)
    real = runStreaming(
      'node packages/pipeline/src/cli.mjs pipeline-selftest --max-rounds 1'
    )
    const p = join(fixture, 'issues.md')
    if (existsSync(p)) issues = readFileSync(p, 'utf8')
  } finally {
    // Always, even if the run threw: the tree was clean going in, so anything
    // here now was produced by the run and is safe to drop.
    git(`git checkout -q ${origin}`)
    git(`git branch -q -D ${branch}`)
    git(
      'git clean -qfd .claude/plans/pipeline-selftest apps/web/src/lib/selftest'
    )
    git('git checkout -q -- .')
  }

  section('live run · what it did')
  const said = (t) => real.out.includes(t)

  assert(real.code === 1, 'halted with exit 1', `got ${real.code}`)
  assert(said('failed   pnpm -F web typecheck'), 'typecheck went red')
  assert(said('policy   stop'), 'policy chose stop')
  assert(said('· plan'), 'reviewer answered `plan`, not `implementation`')
  assert(said('STOPPED at flat task 1 (plan)'), 'stopped for a human')
  assert(issues !== null, 'wrote issues.md')
  // Not decoration: reviewer.md tells it to quote the package, and a verdict
  // with no evidence is a guess that happened to be right.
  assert(
    issues?.includes('bigint') && issues?.includes('index.d.ts'),
    'quoted client-zip as evidence'
  )
  assert(git('git rev-parse HEAD').out === head, 'committed nothing')
  assert(
    readFileSync(join(fixture, 'steps.md'), 'utf8').includes('- [ ]'),
    'left the fixture unticked'
  )
  assert(
    git('git status --porcelain').out.length === 0,
    'cleaned up after itself'
  )
}

console.log(failures ? `\n${failures} failed` : '\nall clear')
process.exit(failures ? 1 : 0)
