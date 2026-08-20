// No `runtime` export: nodejs is the default and edge is deprecated in 16.3.0.
import { normalizeUrl } from '@/lib/paywall-remover/normalize'
import { describeUrl } from '@/lib/paywall-remover/pipeline'

export const maxDuration = 20

function invalid(url: string) {
  return Response.json(
    { ok: false, reason: 'invalid-url', url },
    { status: 400 }
  )
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return invalid('')
  }

  const raw = (body as { url?: unknown })?.url
  if (typeof raw !== 'string') return invalid('')

  const url = normalizeUrl(raw)
  if (!url) return invalid(raw)

  return Response.json({ ok: true, article: await describeUrl(url) })
}
