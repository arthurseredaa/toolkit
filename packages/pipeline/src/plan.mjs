import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TASK_RE = /^##\s+Task\s+(\d+)\s*[—-]\s*(.+?)\s*$/
const AGENT_RE = /^\*\*Agent:\*\*\s*(.+?)\s*$/
const BOX_RE = /^(\s*)- \[([ x])\]\s/

// A task's agent spec: "worker", "tdd -> worker", "tdd → worker".
function parseAgents(line) {
  return line
    .split(/->|→/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function parseTasks(text) {
  const lines = text.split('\n')
  const heads = []

  for (let i = 0; i < lines.length; i++) {
    const m = TASK_RE.exec(lines[i])
    if (m) heads.push({ i, number: Number(m[1]), title: m[2] })
    else if (heads.length && /^##\s/.test(lines[i]))
      heads[heads.length - 1].end ??= i
  }

  return heads.map((h, n) => {
    const end = h.end ?? heads[n + 1]?.i ?? lines.length
    const body = lines.slice(h.i, end)
    const boxes = []
    let agents = ['worker']

    for (let k = 0; k < body.length; k++) {
      const a = AGENT_RE.exec(body[k])
      if (a) agents = parseAgents(a[1])
      if (BOX_RE.test(body[k])) boxes.push({ line: h.i + k })
    }

    for (const b of boxes) b.done = /- \[x\]/.test(lines[b.line])

    return {
      number: h.number,
      title: h.title,
      agents,
      boxes,
      start: h.i,
      end,
      body: body.join('\n'),
      done: boxes.length > 0 && boxes.every((b) => b.done)
    }
  })
}

function loadChunk(dir, name) {
  const stepsPath = join(dir, 'steps.md')
  const planPath = join(dir, 'plan.md')
  if (!existsSync(stepsPath)) return null

  const steps = readFileSync(stepsPath, 'utf8')
  const tasks = parseTasks(steps)

  return {
    name,
    dir,
    stepsPath,
    planPath: existsSync(planPath) ? planPath : null,
    // An empty steps.md means the plan was never approved (planner Gate 2).
    approved: steps.trim().length > 0 && tasks.length > 0,
    tasks
  }
}

export function loadPlan(planDir) {
  const flat = loadChunk(planDir, 'flat')
  if (flat) return { dir: planDir, chunks: [flat] }

  const chunks = readdirSync(planDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => loadChunk(join(planDir, name), name))
    .filter(Boolean)

  return { dir: planDir, chunks }
}

// Mark every checkbox in a task as done. Rewrites steps.md in place.
export function tickTask(chunk, task) {
  const lines = readFileSync(chunk.stepsPath, 'utf8').split('\n')
  for (const b of task.boxes)
    lines[b.line] = lines[b.line].replace('- [ ]', '- [x]')
  writeFileSync(chunk.stepsPath, lines.join('\n'))
}

// The reviewer's verdict lands next to the steps.md it is about, appended so a
// re-run after a partial fix keeps the earlier finding. The pipeline never
// commits it: the run stops here, so this is scratch for the human.
export function writeIssues(chunk, task, text) {
  const path = join(chunk.dir, 'issues.md')
  const prior = existsSync(path)
    ? `${readFileSync(path, 'utf8').trimEnd()}\n\n`
    : ''
  const entry = `## Task ${task.number} — ${task.title}\n\n${text}\n`

  writeFileSync(path, `${prior}${entry}`)
  return path
}

// One walk of the plan, applying the same two filters the runner applies:
// `--chunk` narrows to a single chunk, and an unapproved chunk halts the walk
// rather than being skipped past — the tasks behind it are not safe to run out
// of order. `blockedBy` is that chunk, so the caller can say why the list is
// short instead of guessing.
export function pendingTasks(plan, { chunk: only } = {}) {
  const tasks = []

  for (const chunk of plan.chunks) {
    if (only && chunk.name !== only) continue
    if (!chunk.approved) return { tasks, blockedBy: chunk }

    for (const task of chunk.tasks) if (!task.done) tasks.push({ chunk, task })
  }

  return { tasks, blockedBy: null }
}
