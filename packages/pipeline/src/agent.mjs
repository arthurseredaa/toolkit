import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { query } from '@anthropic-ai/claude-agent-sdk'

// `.claude/agents/<name>.md` is the agent's contract. The body becomes the
// system-prompt append; the frontmatter only carries name/description/model.
export function loadAgentDefinition(root, name) {
  const path = join(root, '.claude', 'agents', `${name}.md`)
  if (!existsSync(path)) throw new Error(`no agent definition at ${path}`)

  const raw = readFileSync(path, 'utf8')
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw)
  const front = m ? m[1] : ''
  const body = m ? m[2] : raw
  const model = /^model:\s*(.+)$/m.exec(front)?.[1]?.trim()

  return { name, body: body.trim(), model }
}

// Agents run unattended, so nothing may open a permission prompt. 'dontAsk'
// denies anything not pre-approved instead of blocking on a question no one is
// there to answer. Pre-approval is this list plus the repo's own deny rules,
// which arrive via settingSources.
const TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'TodoWrite']

// A diagnostic agent must not be able to change the tree it is diagnosing, so
// the guarantee is the tool list rather than a line in its prompt. No Bash
// either — `echo >` is a write. Whatever it needs from git, the caller puts in
// the prompt.
export const READ_ONLY_TOOLS = ['Read', 'Grep', 'Glob']

export async function runAgent({
  definition,
  prompt,
  cwd,
  allowedTools = TOOLS,
  outputFormat,
  maxTurns = 60,
  dryRun = false,
  onEvent = () => {}
}) {
  if (dryRun) {
    onEvent({ type: 'dry-run', agent: definition.name })
    return {
      ok: true,
      text: '(dry-run)',
      structured: null,
      turns: 0,
      costUsd: 0,
      tools: []
    }
  }

  const tools = []
  let text = ''
  let result = null

  const stream = query({
    prompt,
    options: {
      cwd,
      // Loads CLAUDE.md, skills, hooks and permissions from ~/.claude and
      // ./.claude — including the PostToolUse lint/format hook.
      settingSources: ['user', 'project'],
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: definition.body
      },
      allowedTools,
      permissionMode: 'dontAsk',
      model: definition.model,
      maxTurns,
      // Omitted rather than passed as undefined: only the reviewer wants a
      // schema, and the SDK reads the key's presence.
      ...(outputFormat ? { outputFormat } : {})
    }
  })

  for await (const message of stream) {
    if (message.type === 'assistant') {
      for (const block of message.message.content) {
        if (block.type === 'text') text += block.text
        if (block.type === 'tool_use') {
          tools.push(block.name)
          onEvent({ type: 'tool', agent: definition.name, name: block.name })
        }
      }
    }
    if (message.type === 'result') result = message
  }

  return {
    ok: result?.subtype === 'success' && !result.is_error,
    text: result?.result ?? text,
    // Only populated when `outputFormat` was set. A schema violation never
    // reaches here: the SDK retries, then fails the run with
    // `error_max_structured_output_retries`, which `ok` already catches.
    structured: result?.structured_output ?? null,
    turns: result?.num_turns ?? 0,
    costUsd: result?.total_cost_usd ?? 0,
    subtype: result?.subtype ?? 'unknown',
    tools
  }
}
