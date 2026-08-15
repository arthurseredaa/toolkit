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

  return { results, ok: results.every((r) => r.status !== 'failed') }
}
