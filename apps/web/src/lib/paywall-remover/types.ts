export type BlockType = 'p' | 'h2' | 'h3' | 'li' | 'quote'

export type Block = { type: BlockType; text: string }

export type RouteName = 'publisher' | 'archive'

export type Article = {
  id: string
  url: string
  title: string
  author: string | null
  publishedAt: string | null
  siteName: string | null
  route: RouteName
  snapshotAt: string | null
  blocks: Block[]
  savedAt: number
}

export type FailureReason =
  | 'invalid-url'
  | 'blocked'
  | 'paywalled'
  | 'no-snapshot'
  | 'timeout'

export type ExtractResult =
  | { ok: true; article: Article }
  | { ok: false; reason: FailureReason; url: string }

export type RouteOutcome =
  | { ok: true; article: Article }
  | { ok: false; reason: FailureReason }
