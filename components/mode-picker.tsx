'use client'

import { Lightbulb, Pencil } from 'lucide-react'

export type AppMode = 'planning' | 'drawing'

export function ModePicker({
  mode,
  onModeChange,
}: {
  mode: AppMode
  onModeChange: (mode: AppMode) => void
}) {
  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
      <button
        type="button"
        onClick={() => onModeChange('drawing')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          mode === 'drawing'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Pencil className="h-3.5 w-3.5" />
        <span>그리기</span>
      </button>
      <button
        type="button"
        onClick={() => onModeChange('planning')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          mode === 'planning'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Lightbulb className="h-3.5 w-3.5" />
        <span>기획하기</span>
      </button>
    </div>
  )
}
