import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'

import { readDeclaration } from './completeness'
import { canonicalKey } from './normalize'
import type { Block, BlockType } from './types'

// Swap this import for jsdom if a real site parses badly — both hand back a
// `document`. See ./plan.md, "jsdom escape hatch".

const BLOCK_SELECTOR = 'p, h2, h3, h4, li, blockquote'

const TYPE_BY_TAG: Record<string, BlockType> = {
  P: 'p',
  H2: 'h2',
  H3: 'h3',
  H4: 'h3',
  LI: 'li',
  BLOCKQUOTE: 'quote'
}

export type Parsed = {
  key: string
  title: string
  author: string | null
  publishedAt: string | null
  siteName: string | null
  declared: boolean | null
  blocks: Block[]
  length: number
}

export function toBlocks(root: Element): Block[] {
  const blocks: Block[] = []

  for (const el of root.querySelectorAll(BLOCK_SELECTOR)) {
    const type = TYPE_BY_TAG[el.tagName.toUpperCase()]
    if (!type) continue
    // `<li><p>…</p></li>` would otherwise emit the same text twice.
    if (type === 'p' && el.closest('li, blockquote')) continue

    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text.length === 0) continue

    blocks.push({ type, text })
  }

  return blocks
}

export function parseArticle(html: string, pageUrl: string): Parsed | null {
  const { document } = parseHTML(html)
  const doc = document as unknown as Document

  // Readability mutates the document, so read our own signals first.
  const key = canonicalKey(doc, pageUrl)
  const declared = readDeclaration(doc)

  const article = new Readability(doc, {
    serializer: (el: unknown) => el
  }).parse()

  if (!article?.content) return null

  const blocks = toBlocks(article.content as unknown as Element)
  if (blocks.length === 0) return null

  return {
    key,
    title: article.title?.trim() || pageUrl,
    author: article.byline?.trim() || null,
    publishedAt: article.publishedTime?.trim() || null,
    siteName: article.siteName?.trim() || null,
    declared,
    blocks,
    length: blocks.reduce((n, block) => n + block.text.length, 0)
  }
}
