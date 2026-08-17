'use client'

import { useRef, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { compressInBrowser, type Compress } from '@/lib/compress/client'
import { ACCEPT, filterFiles, isSafariUA } from '@/lib/compress/input'
import { DEFAULT_PRESET, PRESET_ORDER, PRESETS } from '@/lib/compress/presets'
import {
  canShareFiles,
  shareFiles,
  toFiles,
  zipName,
  zipResults
} from '@/lib/compress/share'
import { formatBytes, savingsPercent } from '@/lib/compress/size'
import { createJob, createMemoryStore } from '@/lib/compress/store'
import type { Job, PresetName } from '@/lib/compress/types'
import { cn } from '@/lib/utils'

import { DetailView } from './detail-view'
import { useObjectUrl } from './use-object-url'

type Props = {
  /** Injected in tests; defaults to the real worker pool. */
  compress?: Compress
  /** Injected in tests; defaults to user-agent detection after hydration. */
  isSafari?: boolean
  /** Injected in tests; defaults to a media query after hydration. */
  hasFinePointer?: boolean
}

const noSubscribe = () => () => {}

export function Compressor({
  compress = compressInBrowser,
  isSafari: isSafariProp,
  hasFinePointer: finePointerProp
}: Props) {
  const [store] = useState(createMemoryStore)
  const jobs = useSyncExternalStore(store.subscribe, store.all, store.all)
  const detectedSafari = useSyncExternalStore(
    noSubscribe,
    () => isSafariUA(navigator.userAgent),
    () => false
  )
  const safari = isSafariProp ?? detectedSafari

  // A zip is the desktop answer; on a phone the share sheet is the good one.
  const detectedFinePointer = useSyncExternalStore(
    noSubscribe,
    () => window.matchMedia('(pointer: fine)').matches,
    () => false
  )
  const finePointer = finePointerProp ?? detectedFinePointer

  const [batchPreset, setBatchPreset] = useState<PresetName>(DEFAULT_PRESET)
  const [skippedHeic, setSkippedHeic] = useState(0)
  const [skippedUnsupported, setSkippedUnsupported] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [packing, setPacking] = useState(false)
  const [packError, setPackError] = useState<string | null>(null)
  const runs = useRef(new Map<string, number>())

  const finished = jobs.flatMap((j) =>
    j.status === 'done' && j.result ? [j.result] : []
  )
  const shareable = canShareFiles(toFiles(finished))
  const open = openId ? jobs.find((j) => j.id === openId) : undefined

  // `flatten` is read with `??` rather than taken as a default parameter: a
  // member expression in a default makes React Compiler bail on the whole
  // component (`lowerReorderableExpression`), silently un-memoizing it.
  function run(job: Job, preset: PresetName, flatten?: boolean) {
    const flat = flatten ?? job.flatten
    const token = (runs.current.get(job.id) ?? 0) + 1
    runs.current.set(job.id, token)
    store.update(job.id, { status: 'working', error: undefined })
    compress(job.file, PRESETS[preset].quality, { flatten: flat }).then(
      (result) => {
        if (runs.current.get(job.id) === token)
          store.update(job.id, { status: 'done', result })
      },
      (e: unknown) => {
        if (runs.current.get(job.id) === token)
          store.update(job.id, {
            status: 'error',
            error: e instanceof Error ? e.message : String(e)
          })
      }
    )
  }

  function addFiles(list: Iterable<File>) {
    const { accepted, skippedHeic, skippedUnsupported } = filterFiles(list, {
      isSafari: safari
    })
    setSkippedHeic(skippedHeic)
    setSkippedUnsupported(skippedUnsupported)
    const added = accepted.map(createJob)
    store.add(added)
    for (const job of added) run(job, batchPreset)
  }

  function changeBatchPreset(preset: PresetName) {
    setBatchPreset(preset)
    for (const job of store.all()) if (!job.preset) run(job, preset)
  }

  function overridePreset(job: Job, preset: PresetName) {
    store.update(job.id, { preset })
    run(job, preset)
  }

  function flattenJob(job: Job) {
    store.update(job.id, { flatten: true })
    run(job, job.preset ?? batchPreset, true)
  }

  function downloadPack() {
    setPacking(true)
    setPackError(null)
    zipResults(finished)
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = zipName()
        a.click()
        // revoking in the same tick cancels the download in Firefox
        setTimeout(() => URL.revokeObjectURL(url), 0)
      })
      // The archive is built whole in memory, so this is the batch that did
      // not fit. Saying so beats a button that quietly does nothing.
      .catch((e: unknown) =>
        setPackError(e instanceof Error ? e.message : String(e))
      )
      .finally(() => setPacking(false))
  }

  return (
    <section className="mt-8 flex flex-col gap-6">
      <div role="group" aria-label="Quality" className="flex gap-2">
        {PRESET_ORDER.map((name) => (
          <Button
            key={name}
            size="sm"
            variant={batchPreset === name ? 'default' : 'outline'}
            aria-pressed={batchPreset === name}
            onClick={() => changeBatchPreset(name)}
          >
            {PRESETS[name].label}
          </Button>
        ))}
      </div>

      <label
        className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground transition-colors hover:border-foreground/20"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          addFiles(e.dataTransfer.files)
        }}
      >
        <span>Drop photos here or tap to choose</span>
        <span className="mt-1 font-mono text-xs">
          JPEG · PNG · WebP{safari ? ' · HEIC' : ''}
        </span>
        <input
          type="file"
          multiple
          accept={ACCEPT(safari)}
          aria-label="Add photos"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </label>

      {skippedHeic > 0 ? (
        <p role="status" className="font-mono text-xs text-muted-foreground">
          Skipped {skippedHeic} HEIC — this browser cannot decode it; export as
          JPEG first.
        </p>
      ) : null}

      {skippedUnsupported > 0 ? (
        <p role="status" className="font-mono text-xs text-muted-foreground">
          Skipped {skippedUnsupported} — only JPEG, PNG and WebP are supported.
        </p>
      ) : null}

      {jobs.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border">
          {jobs.map((job) => (
            <Row
              key={job.id}
              job={job}
              onOpen={() => setOpenId(job.id)}
              onRemove={() => store.remove(job.id)}
              onFlatten={() => flattenJob(job)}
            />
          ))}
        </ul>
      ) : null}

      {finished.length > 0 && shareable ? (
        <Button onClick={() => void shareFiles(toFiles(finished))}>
          Save all ({finished.length})
        </Button>
      ) : null}

      {finePointer && finished.length > 1 ? (
        <Button variant="outline" disabled={packing} onClick={downloadPack}>
          {packing ? 'Packing…' : `Download all (${finished.length})`}
        </Button>
      ) : null}

      {packError ? (
        <p role="alert" className="font-mono text-xs text-destructive">
          Could not build the zip ({packError}). Try fewer photos at once.
        </p>
      ) : null}

      {open ? (
        <DetailView
          job={open}
          batchPreset={batchPreset}
          onPreset={(preset) => overridePreset(open, preset)}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </section>
  )
}

function statusLine(job: Job): string {
  if (job.status === 'queued') return 'Queued'
  if (job.status === 'working') return 'Compressing…'
  if (job.status === 'error') return job.error ?? 'Failed'
  if (!job.result) return ''
  const { originalSize, blob, name } = job.result
  if (job.result.kept && job.result.transparent)
    return `${formatBytes(originalSize)} · kept — transparent PNG`
  const base = `${formatBytes(originalSize)} → ${formatBytes(blob.size)} · −${savingsPercent(originalSize, blob.size)}%`
  return name === job.file.name ? base : `${base} · ${name}`
}

function Row({
  job,
  onOpen,
  onRemove,
  onFlatten
}: {
  job: Job
  onOpen: () => void
  onRemove: () => void
  onFlatten: () => void
}) {
  const url = useObjectUrl(job.result?.blob)

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="block truncate text-sm">{job.file.name}</span>
        <span
          className={cn(
            'block font-mono text-xs',
            job.status === 'error'
              ? 'text-destructive'
              : 'text-muted-foreground'
          )}
        >
          {statusLine(job)}
        </span>
      </button>
      {job.status === 'done' && job.result?.transparent && !job.flatten ? (
        <Button
          variant="outline"
          size="xs"
          aria-label={`Convert ${job.file.name} to JPEG`}
          onClick={onFlatten}
        >
          Make JPEG
        </Button>
      ) : null}
      {job.status === 'done' && job.result && url ? (
        <a
          href={url}
          download={job.result.name}
          className="font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          Download
        </a>
      ) : null}
      <Button
        variant="ghost"
        size="xs"
        aria-label={`Remove ${job.file.name}`}
        onClick={onRemove}
      >
        ×
      </Button>
    </li>
  )
}
