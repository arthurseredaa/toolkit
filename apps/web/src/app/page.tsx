import { ToolGrid } from '@/components/dashboard/tool-grid'
import { tools } from '@/components/dashboard/tools'
import { Input } from '@/components/ui/input'

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <Input
        className="mb-10 h-9"
        type="search"
        placeholder="Search tools…"
        aria-label="Search tools"
      />

      <ToolGrid tools={tools} />
    </main>
  )
}
