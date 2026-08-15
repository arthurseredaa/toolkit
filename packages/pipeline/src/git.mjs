import { sh } from './gates.mjs'

const DEFAULT_BRANCHES = new Set(['main', 'master'])

export function currentBranch(cwd) {
  return sh('git rev-parse --abbrev-ref HEAD', { cwd }).out
}

export function isDirty(cwd) {
  return sh('git status --porcelain', { cwd }).out.length > 0
}

// The pipeline commits per task, so it must never run on the default branch.
// Creating the branch is left to the engineer on purpose.
export function assertBranch(cwd) {
  const branch = currentBranch(cwd)
  if (DEFAULT_BRANCHES.has(branch))
    throw new Error(
      `refusing to run on '${branch}'. Create a branch first:\n` +
        `  git checkout -b feat/<name>`
    )
  return branch
}

export function commitTask(cwd, task, { dryRun }) {
  if (!dryRun && !isDirty(cwd))
    return { ok: true, skipped: true, out: 'nothing to commit' }

  const subject = `feat: ${task.title}`
  const add = sh('git add -A', { cwd, dryRun })
  if (!add.ok) return { ok: false, out: add.out }

  return sh(`git commit -m ${JSON.stringify(subject)}`, { cwd, dryRun })
}

export function createPr(cwd, { title, body, dryRun }) {
  const push = sh('git push -u origin HEAD', { cwd, dryRun })
  if (!push.ok) return { ok: false, out: push.out }

  const cmd =
    `gh pr create --title ${JSON.stringify(title)} ` +
    `--body ${JSON.stringify(body)}`
  return sh(cmd, { cwd, dryRun })
}
