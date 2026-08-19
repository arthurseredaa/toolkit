'use client'

import { motion, stagger, useReducedMotion } from 'motion/react'
import Link from 'next/link'

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

import { ArticleCount } from './article-count'
import type { Tool } from './tools'

const container = {
  hidden: {},
  visible: { transition: { delayChildren: stagger(0.025) } }
}

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: 'easeOut' as const }
  }
}

export function ToolGrid({ tools }: { tools: Tool[] }) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.ul
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      variants={reduceMotion ? undefined : container}
      initial={reduceMotion ? false : 'hidden'}
      animate={reduceMotion ? false : 'visible'}
    >
      {tools.map((tool) => (
        <motion.li key={tool.slug} variants={reduceMotion ? undefined : item}>
          <Link
            href={`/${tool.slug}`}
            className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="h-full transition-colors hover:border-foreground/20">
              <CardHeader>
                <CardTitle>{tool.name}</CardTitle>
                <CardDescription>{tool.description}</CardDescription>
              </CardHeader>
              <div className="px-(--card-spacing) font-mono text-xs text-muted-foreground">
                {tool.slug === 'paywall-remover' ? <ArticleCount /> : tool.stat}
              </div>
            </Card>
          </Link>
        </motion.li>
      ))}
    </motion.ul>
  )
}
