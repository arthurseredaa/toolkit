import { ToolGrid } from '@/components/dashboard/tool-grid'
import { tools } from '@/components/dashboard/tools'
import { Input } from '@/components/ui/input'

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <div className="relative mb-10">
        <Input
          className="h-9 pr-12"
          type="search"
          placeholder="Search tools…"
          aria-label="Search tools"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-muted-foreground">
          ⌘K
        </span>
      </div>

      <ToolGrid tools={tools} />
    </main>
  )
}
