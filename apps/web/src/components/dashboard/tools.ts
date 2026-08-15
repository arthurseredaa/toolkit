export type Tool = {
  slug: string
  name: string
  description: string
  stat: string
}

export const tools: Tool[] = [
  {
    slug: 'faq',
    name: 'FAQ',
    description: 'Fixes I keep forgetting',
    stat: '142 entries'
  },
  {
    slug: 'compress',
    name: 'Compress',
    description: 'Batch resize and convert',
    stat: '1.2k processed'
  },
  {
    slug: 'vinted',
    name: 'Vinted',
    description: 'Listings and profit',
    stat: '38 active'
  },
  {
    slug: 'links',
    name: 'Links',
    description: 'Short links, click stats',
    stat: '214 clicks'
  },
  {
    slug: 'analytics',
    name: 'Analytics',
    description: 'Daily channel snapshots',
    stat: 'synced 2h ago'
  }
]
