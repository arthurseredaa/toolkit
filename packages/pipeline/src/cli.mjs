#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { loadAgentDefinition, runAgent } from './agent.mjs'
import { resolveGates, runGates, sh } from './gates.mjs'
import { assertBranch, commitTask, createPr } from './git.mjs'
import { firstPending, loadPlan, tickTask } from './plan.mjs'

function parseArgs(argv) {
  const opts = { dryRun: false, maxRounds: 3, pr: false, limit: Infinity }
  const rest = []

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') opts.dryRun = true
    else if (a === '--pr') opts.pr = true
    else if (a === '--max-rounds') opts.maxRounds = Number(argv[++i])
    else if (a === '--limit') opts.limit = Number(argv[++i])
    else if (a === '--chunk') opts.chunk = argv[++i]
    else rest.push(a)
  }

  opts.feature = rest[0]
  return opts
}

const log = (...a) => console.log(...a)
const step = (s) => log(`\n── ${s}`)

function taskPrompt(chunk, task, extra) {
  const planRef = chunk.planPath
    ? `Decisions for this chunk live in ${chunk.planPath}. Read it first.`
    : ''

  return [
    `You are executing one task from ${chunk.stepsPath}.`,
    planRef,
    '',
    'The task, verbatim:',
    '',
    task.body,
    '',
    extra ?? '',
    '',
    'Do only this task. Do not start the next one.'
  ]
    .filter(Boolean)
    .join('\n')
}

async function runTask({ root, chunk, task, agents, opts, gates }) {
  let tddReport = null

  if (task.agents.includes('tdd')) {
    step(`task ${task.number} · tdd · ${task.title}`)
    const red = await runAgent({
      definition: agents.tdd,
      prompt: taskPrompt(
        chunk,
        task,
        'Write only the failing test for this task. Never write ' +
          'implementation code. Report the verbatim runner output.'
      ),
      cwd: root,
      dryRun: opts.dryRun,
      onEvent: (e) => e.type === 'tool' && process.stdout.write('.')
    })
    log(`\n   ${red.subtype ?? 'dry-run'} · ${red.turns} turns`)
    if (!red.ok) return { ok: false, stage: 'tdd', detail: red.text }
    tddReport = red.text
  }

  let gateRun = null

  for (let round = 1; round <= opts.maxRounds; round++) {
    step(`task ${task.number} · worker · round ${round}/${opts.maxRounds}`)

    const extra = [
      tddReport && `The tdd agent reported:\n\n${tddReport}`,
      gateRun &&
        `The previous attempt failed these gates:\n\n${gateRun.results
          .filter((r) => r.status === 'failed')
          .map((r) => `$ ${r.cmd}\n${r.out}`)
          .join('\n\n')}`
    ]
      .filter(Boolean)
      .join('\n\n')

    const green = await runAgent({
      definition: agents.worker,
      prompt: taskPrompt(chunk, task, extra),
      cwd: root,
      dryRun: opts.dryRun,
      onEvent: (e) => e.type === 'tool' && process.stdout.write('.')
    })
    log(`\n   ${green.subtype ?? 'dry-run'} · ${green.turns} turns`)

    step(`task ${task.number} · gates`)
    gateRun = runGates(gates, { cwd: root, dryRun: opts.dryRun })
    for (const r of gateRun.results) log(`   ${r.status.padEnd(8)} ${r.cmd}`)

    if (gateRun.ok) return { ok: true, rounds: round }
  }

  return { ok: false, stage: 'gates', detail: gateRun }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (!opts.feature) {
    console.error('usage: run-plan <feature> [--dry-run] [--limit N] [--pr]')
    process.exit(64)
  }

  const root = sh('git rev-parse --show-toplevel').out
  const planDir = join(root, '.claude', 'plans', opts.feature)
  if (!existsSync(planDir)) {
    console.error(`no plan at ${planDir}`)
    process.exit(66)
  }

  log(`repo    ${root}`)
  log(`plan    ${planDir}`)
  log(`mode    ${opts.dryRun ? 'DRY RUN (no model calls, no writes)' : 'live'}`)

  if (!opts.dryRun) log(`branch  ${assertBranch(root)}`)

  const plan = loadPlan(planDir)
  const agents = {
    tdd: loadAgentDefinition(root, 'tdd'),
    worker: loadAgentDefinition(root, 'worker')
  }
  const gates = resolveGates(root)

  log('\nchunks')
  for (const c of plan.chunks) {
    const done = c.tasks.filter((t) => t.done).length
    const state = c.approved ? 'approved' : 'NOT APPROVED (empty steps.md)'
    log(`  ${c.name.padEnd(16)} ${done}/${c.tasks.length} done · ${state}`)
    for (const t of c.tasks)
      log(
        `    ${t.done ? 'x' : ' '} Task ${t.number} ` +
          `[${t.agents.join(' -> ')}] ${t.title}`
      )
  }

  log('\ngates')
  for (const g of gates) log(`  ${g.has ? 'ready  ' : 'skipped'} ${g.cmd}`)

  const pending = firstPending(plan)
  if (!pending) {
    log('\nnothing pending — every task is ticked')
    return
  }

  let executed = 0

  for (const chunk of plan.chunks) {
    if (opts.chunk && chunk.name !== opts.chunk) continue
    if (!chunk.approved) {
      log(`\nstopping: ${chunk.name} has no approved steps.md`)
      break
    }

    for (const task of chunk.tasks) {
      if (task.done) continue
      if (executed >= opts.limit) {
        log(`\nreached --limit ${opts.limit}`)
        return
      }

      const r = await runTask({ root, chunk, task, agents, opts, gates })
      executed++

      if (!r.ok) {
        log(`\nSTOPPED at ${chunk.name} task ${task.number} (${r.stage})`)
        log('Tree left as-is for you to inspect. Nothing was committed.')
        process.exitCode = 1
        return
      }

      if (!opts.dryRun) tickTask(chunk, task)
      const c = commitTask(root, task, { dryRun: opts.dryRun })
      log(
        `   commit  ${c.skipped ? 'skipped (clean tree)' : c.out.split('\n')[0]}`
      )
    }
  }

  if (opts.pr) {
    step('create PR')
    const pr = createPr(root, {
      title: `feat: ${opts.feature}`,
      body: `Executed \`.claude/plans/${opts.feature}\` via the pipeline.`,
      dryRun: opts.dryRun
    })
    log(pr.out)
  }

  log(`\ndone · ${executed} task(s) executed`)
}

main().catch((e) => {
  console.error(`\n${e.message}`)
  process.exit(1)
})
