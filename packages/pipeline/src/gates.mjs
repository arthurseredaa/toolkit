import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export function sh(cmd, { cwd, dryRun = false } = {}) {
  if (dryRun) return { ok: true, code: 0, out: `(dry-run) ${cmd}` }

  const r = spawnSync('bash', ['-lc', cmd], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  })

  return {
    ok: r.status === 0,
    code: r.status ?? -1,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  }
}

function scripts(root, pkgPath) {
  const p = join(root, pkgPath)
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, 'utf8')).scripts ?? {}
  } catch {
    return {}
  }
}

// A gate reports one of four statuses, and this file is the only place that
// says which of them block. 'skipped' does: a gate whose script does not exist
// has proved nothing, so it counts as red until someone writes the script.
// 'dry-run' does not, which is why a dry run always reaches `accept`.
const BLOCKING = new Set(['failed', 'skipped'])

export function isBlocking(result) {
  return BLOCKING.has(result.status)
}

// The block of evidence handed to an agent when a round did not go green.
// Both the worker's retry prompt and the reviewer's prompt want the same
// shape, and both must agree with `isBlocking` about what counts as evidence.
export function formatFailures(gateRun) {
  return gateRun.results
    .filter(isBlocking)
    .map((r) => `$ ${r.cmd}\n${r.out}`)
    .join('\n\n')
}

// Deterministic gates. Each runs only when its script actually exists, so a
// half-bootstrapped repo reports "skipped" instead of a false red.
//
// `pnpm fmt:check` is deliberately absent: it is already red on a clean tree
// (see .claude/agents/worker.md). Formatting is enforced per-file by the
// PostToolUse hook at .claude/hooks/lint-format.sh instead.
export function resolveGates(root) {
  const rootScripts = scripts(root, 'package.json')
  const webScripts = scripts(root, 'apps/web/package.json')

  return [
    { name: 'test', cmd: 'pnpm -F web test', has: 'test' in webScripts },
    {
      name: 'typecheck',
      cmd: 'pnpm -F web typecheck',
      has: 'typecheck' in webScripts
    },
    { name: 'lint', cmd: 'pnpm lint', has: 'lint' in rootScripts }
  ]
}

export function runGates(gates, { cwd, dryRun }) {
  const results = []

  for (const gate of gates) {
    if (!gate.has) {
      results.push({ ...gate, status: 'skipped', out: 'no such script' })
      continue
    }
    if (dryRun) {
      results.push({ ...gate, status: 'dry-run', out: 'not executed' })
      continue
    }
    const r = sh(gate.cmd, { cwd })
    results.push({ ...gate, status: r.ok ? 'passed' : 'failed', out: r.out })
  }

  // No aggregate `ok` here on purpose: whether a run is acceptable is
  // `decideNext`'s answer, and a second one on this object would be a
  // convenient way to disagree with it.
  return { results }
}
