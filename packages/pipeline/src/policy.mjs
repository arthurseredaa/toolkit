import { isBlocking } from './gates.mjs'

export function decideNext({ gateRun, round, maxRounds }) {
  const blocking = gateRun.results.filter(isBlocking)

  if (blocking.length === 0) return { action: 'accept' }

  const summary = blocking.map((r) => `${r.name} ${r.status}`).join(', ')

  if (round >= maxRounds)
    return { action: 'stop', reason: `${summary} after ${maxRounds} rounds` }

  const skipped = blocking.some((r) => r.status === 'skipped')

  return {
    action: 'retry',
    hint:
      `These gates are not green: ${summary}.` +
      (skipped
        ? " A 'skipped' gate means its package.json script does not exist " +
          'yet — add it, then make it pass.'
        : '')
  }
}
