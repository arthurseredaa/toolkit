'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { PRESET_ORDER, PRESETS } from '@/lib/compress/presets'
import { formatBytes, savingsPercent } from '@/lib/compress/size'
import type { Job, PresetName } from '@/lib/compress/types'

import { useObjectUrl } from './use-object-url'

type Props = {
  job: Job
  batchPreset: PresetName
  onPreset: (preset: PresetName) => void
  onClose: () => void
}

function caption(job: Job): string {
  if (job.status === 'done' && job.result) {
    const { originalSize, blob } = job.result
    return `${formatBytes(originalSize)} → ${formatBytes(blob.size)} · −${savingsPercent(originalSize, blob.size)}%`
  }
  if (job.status === 'error') return job.error ?? 'Failed'
  return 'Compressing…'
}

export function DetailView({ job, batchPreset, onPreset, onClose }: Props) {
  const [holding, setHolding] = useState(false)
  const originalUrl = useObjectUrl(job.file)
  const resultUrl = useObjectUrl(job.result?.blob)
  const active = job.preset ?? batchPreset

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const showOriginal = holding || !resultUrl
  const src = showOriginal ? originalUrl : resultUrl
  const release = () => setHolding(false)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={job.file.name}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <span className="truncate text-sm">{job.file.name}</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center bg-muted/40 select-none"
        style={{ WebkitTouchCallout: 'none' }}
        onPointerDown={() => setHolding(true)}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        onContextMenu={(e) => e.preventDefault()}
      >
        {src ? (
          <img
            src={src}
            alt={showOriginal ? 'Original' : 'Compressed'}
            draggable={false}
            className="max-h-full max-w-full object-contain"
          />
        ) : null}
      </div>

      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="font-mono text-xs text-muted-foreground">
          {caption(job)} · hold to see original
        </p>
        <div
          role="group"
          aria-label="Quality for this photo"
          className="flex gap-2"
        >
          {PRESET_ORDER.map((name) => (
            <Button
              key={name}
              size="sm"
              variant={active === name ? 'default' : 'outline'}
              aria-pressed={active === name}
              onClick={() => onPreset(name)}
            >
              {PRESETS[name].label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
