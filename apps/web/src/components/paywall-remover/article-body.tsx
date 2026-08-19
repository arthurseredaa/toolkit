import type { Article, Block } from '@/lib/paywall-remover/types'

export type Group = Block | { type: 'list'; items: string[] }

export function groupBlocks(blocks: Block[]): Group[] {
  const out: Group[] = []

  for (const block of blocks) {
    if (block.type !== 'li') {
      out.push(block)
      continue
    }

    const last = out[out.length - 1]
    if (last && last.type === 'list') last.items.push(block.text)
    else out.push({ type: 'list', items: [block.text] })
  }

  return out
}

function Badge({ article }: { article: Article }) {
  const label =
    article.route === 'publisher'
      ? 'publisher'
      : `archive · ${article.snapshotAt ?? 'undated'}`

  return (
    <span className="rounded-md border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
      {label}
    </span>
  )
}

function Rendered({ group, index }: { group: Group; index: number }) {
  if (group.type === 'list')
    return (
      <ul className="ml-5 list-disc space-y-1">
        {group.items.map((item, i) => (
          <li key={`${index}-${i}`} className="text-[0.95rem] leading-7">
            {item}
          </li>
        ))}
      </ul>
    )

  if (group.type === 'h2')
    return (
      <h2 className="mt-8 text-lg font-medium tracking-tight">{group.text}</h2>
    )

  if (group.type === 'h3')
    return <h3 className="mt-6 text-base font-medium">{group.text}</h3>

  if (group.type === 'quote')
    return (
      <blockquote className="border-l-2 border-border pl-4 text-muted-foreground italic">
        {group.text}
      </blockquote>
    )

  return <p className="text-[0.95rem] leading-7">{group.text}</p>
}

export function ArticleBody({ article }: { article: Article }) {
  return (
    <article className="mt-8">
      <h1 className="text-2xl font-medium tracking-tight">{article.title}</h1>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {article.author && <span>{article.author}</span>}
        {article.publishedAt && (
          <time dateTime={article.publishedAt}>
            {article.publishedAt.slice(0, 10)}
          </time>
        )}
        <Badge article={article} />
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          className="font-mono hover:text-foreground"
        >
          original ↗
        </a>
      </div>

      <div className="mt-8 space-y-4">
        {groupBlocks(article.blocks).map((group, index) => (
          <Rendered key={index} group={group} index={index} />
        ))}
      </div>
    </article>
  )
}
