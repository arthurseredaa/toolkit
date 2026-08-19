/** @vitest-environment node */
import { describe, expect, it } from 'vitest'

import { parseArticle } from './extract'

const CANONICAL = 'https://harbourreview.example/2026/02/tunnel'
const PAGE_URL = `${CANONICAL}?utm_source=twitter&utm_medium=social#intro`

const LD = {
  '@context': 'https://schema.org',
  '@type': 'NewsArticle',
  headline: 'The Tunnel Under the Harbour',
  author: { '@type': 'Person', name: 'Dana Reyes' },
  publisher: { '@type': 'Organization', name: 'The Harbour Review' },
  datePublished: '2026-02-11T08:30:00Z',
  isAccessibleForFree: false
}

const LEAD =
  'The   tunnel   opened  on a  Tuesday, and by  Wednesday the ferry ' +
  'operators had already filed their first complaint with the transport ' +
  'regulator, arguing that a public crossing subsidised by the province ' +
  'amounted to unfair competition against a service that had run ' +
  'continuously since 1912.'

const BODY =
  'Boring through the harbour floor took four years longer than the ' +
  'original schedule allowed, largely because the survey had ' +
  'underestimated how much of the seabed was landfill rather than ' +
  'bedrock, which forced a redesign of the cutting head partway through ' +
  'the works.'

const NESTED_LI = 'The first  bore  hit  groundwater  at  eleven  metres.'

const PLAIN_LI =
  'The second bore was shifted forty metres east to avoid the same ' +
  'aquifer entirely.'

const QUOTE =
  "We were digging through the city's own rubbish for most of a year, " +
  'and every load told us something new about what had been dumped here.'

const ARTICLE_HTML = `<!doctype html>
<html><head>
<title>The Tunnel Under the Harbour | The Harbour Review</title>
<link rel="canonical" href="${CANONICAL}">
<script type="application/ld+json">${JSON.stringify(LD)}</script>
</head>
<body>
<nav><a href="/">Home</a><a href="/world">World</a></nav>
<article>
<h1>The Tunnel Under the Harbour</h1>
<p>${LEAD}</p>
<h2>What   the   engineers   found</h2>
<p>${BODY}</p>
<ul>
<li><p>${NESTED_LI}</p></li>
<li>${PLAIN_LI}</li>
</ul>
<blockquote><p>${QUOTE}</p></blockquote>
</article>
<footer><p>Copyright the Harbour Review</p></footer>
</body></html>`

const NO_ARTICLE_HTML = `<!doctype html>
<html><head><title>Sign in</title></head>
<body>
<nav><a href="/">Home</a></nav>
<div id="app"></div>
<footer>Copyright</footer>
</body></html>`

function parse() {
  const parsed = parseArticle(ARTICLE_HTML, PAGE_URL)
  if (!parsed) throw new Error('expected the fixture article to parse')
  return parsed
}

describe('parseArticle', () => {
  it('returns the article blocks typed and in document order', () => {
    expect(parse().blocks.map((block) => block.type)).toEqual([
      'p',
      'h2',
      'p',
      'li',
      'li',
      'quote'
    ])
  })

  it('collapses runs of whitespace inside a block to single spaces', () => {
    const [lead, heading] = parse().blocks

    expect(heading.text).toBe('What the engineers found')
    expect(lead.text).toBe(LEAD.replace(/\s+/g, ' '))
    expect(lead.text).not.toMatch(/\s{2}/)
  })

  it('emits a paragraph nested in a list item once, as the list item', () => {
    const blocks = parse().blocks
    const nested = NESTED_LI.replace(/\s+/g, ' ')

    expect(blocks.filter((block) => block.text === nested)).toEqual([
      { type: 'li', text: nested }
    ])
    expect(blocks.map((block) => block.text)).toContain(PLAIN_LI)
  })

  it('emits a paragraph nested in a blockquote once, as a quote', () => {
    const blocks = parse().blocks

    expect(blocks.filter((block) => block.text === QUOTE)).toEqual([
      { type: 'quote', text: QUOTE }
    ])
  })

  it('returns the title, author, site name and published date', () => {
    const parsed = parse()

    expect(parsed.title).toBe('The Tunnel Under the Harbour')
    expect(parsed.author).toBe('Dana Reyes')
    expect(parsed.siteName).toBe('The Harbour Review')
    expect(parsed.publishedAt).toBe('2026-02-11T08:30:00Z')
  })

  it('keys the article by its canonical url, not the tracked page url', () => {
    expect(parse().key).toBe(CANONICAL)
  })

  it('reads the paywall declaration before Readability strips it', () => {
    expect(parse().declared).toBe(false)
  })

  it('reports the length of the extracted block text only', () => {
    const parsed = parse()
    const summed = parsed.blocks.reduce((n, b) => n + b.text.length, 0)

    expect(parsed.length).toBe(summed)
    expect(parsed.length).toBeLessThan(ARTICLE_HTML.length)
  })

  it('returns null for a page carrying no article content', () => {
    expect(parseArticle(NO_ARTICLE_HTML, PAGE_URL)).toBeNull()
  })
})
