import type {
  Article,
  ExtractResult,
  FailureReason,
  RouteOutcome
} from './types'

export type Runners = {
  publisher: (signal: AbortSignal) => Promise<RouteOutcome>
  archive: (signal: AbortSignal) => Promise<RouteOutcome>
}

type Settled = { name: 'publisher' | 'archive'; outcome: RouteOutcome }

function pickReason(
  publisher: RouteOutcome | undefined,
  archive: RouteOutcome | undefined
): FailureReason {
  if (publisher && !publisher.ok && publisher.reason !== 'timeout')
    return publisher.reason
  if (archive && !archive.ok && archive.reason !== 'timeout')
    return archive.reason
  return 'timeout'
}

export async function raceRoutes(
  url: string,
  runners: Runners,
  options: { deadlineMs?: number } = {}
): Promise<ExtractResult> {
  const { deadlineMs = 8000 } = options

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deadlineMs)

  const settled: { publisher?: RouteOutcome; archive?: RouteOutcome } = {}

  // Read fresh on every call so the `never`-narrowing TS applies to a
  // property re-checked across an `await` doesn't apply here.
  const completedPublisher = (): Article | undefined =>
    settled.publisher?.ok ? settled.publisher.article : undefined

  const start = (name: Settled['name']): Promise<Settled> =>
    runners[name](controller.signal)
      .catch((): RouteOutcome => ({ ok: false, reason: 'timeout' }))
      .then((outcome) => {
        settled[name] = outcome
        return { name, outcome }
      })

  const publisher = start('publisher')
  const archive = start('archive')

  try {
    const first = await Promise.race([publisher, archive])

    // "A wins on tie": if the publisher is already complete when anything
    // settles, it is preferred over a snapshot that may be stale.
    const tieWinner = completedPublisher()
    if (tieWinner) return { ok: true, article: tieWinner }
    if (first.outcome.ok) return { ok: true, article: first.outcome.article }

    const second = await (first.name === 'publisher' ? archive : publisher)
    const lateWinner = completedPublisher()
    if (lateWinner) return { ok: true, article: lateWinner }
    if (second.outcome.ok) return { ok: true, article: second.outcome.article }

    return {
      ok: false,
      reason: pickReason(settled.publisher, settled.archive),
      url
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
