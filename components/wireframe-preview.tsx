'use client'

import { DeepPartial } from 'ai'
import { ExcalidrawSchema } from '@/lib/schema'
import { ExcalidrawCanvas } from './excalidraw-canvas'

interface WireframePreviewProps {
  wireframe: DeepPartial<ExcalidrawSchema> | undefined
  onElementsChange?: (elements: any[]) => void
}

export function WireframePreview({
  wireframe,
  onElementsChange,
}: WireframePreviewProps) {
  const elements = wireframe?.excalidraw_elements || []

  return (
    <ExcalidrawCanvas elements={elements} onElementsChange={onElementsChange} />
  )
}
