import { WireframePreview } from './wireframe-preview'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ExcalidrawSchema } from '@/lib/schema'
import { DeepPartial } from 'ai'
import { ChevronsRight, LoaderCircle, Download, Code, Maximize2, Minimize2, X } from 'lucide-react'
import { Dispatch, SetStateAction, useMemo, useState } from 'react'

export function Preview({
  selectedTab,
  onSelectedTabChange,
  isChatLoading,
  wireframe,
  onClose,
  onElementsChange,
  style,
  isFullscreen,
  onToggleFullscreen,
}: {
  selectedTab: 'code' | 'canvas'
  onSelectedTabChange: Dispatch<SetStateAction<'code' | 'canvas'>>
  isChatLoading: boolean
  wireframe?: DeepPartial<ExcalidrawSchema>
  onClose: () => void
  onElementsChange?: (elements: any[]) => void
  style?: React.CSSProperties
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
}) {
  const [showJSON, setShowJSON] = useState(false)

  // Excalidraw JSON 형식으로 변환
  const excalidrawJSON = useMemo(() => {
    return JSON.stringify({
      type: 'excalidraw',
      version: 2,
      elements: wireframe?.excalidraw_elements || [],
      appState: {
        viewBackgroundColor: '#ffffff',
        gridSize: 20,
      },
    }, null, 2)
  }, [wireframe?.excalidraw_elements])

  const handleExport = () => {
    if (!wireframe?.excalidraw_elements) return

    const blob = new Blob([excalidrawJSON], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${wireframe.title || 'wireframe'}.excalidraw`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="absolute md:relative z-10 top-0 left-0 shadow-2xl md:rounded-tl-3xl md:rounded-bl-3xl md:border-l md:border-y bg-popover h-full w-full overflow-hidden">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="w-full p-2 flex items-center justify-between border-b shrink-0">
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground"
                    onClick={onClose}
                  >
                    <ChevronsRight className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Close sidebar'}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {onToggleFullscreen && (
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground"
                      onClick={onToggleFullscreen}
                    >
                      {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>

          <div className="flex items-center gap-1">
            {isChatLoading && (
              <LoaderCircle
                strokeWidth={3}
                className="h-4 w-4 animate-spin text-muted-foreground mr-2"
              />
            )}

            {wireframe?.excalidraw_elements && wireframe.excalidraw_elements.length > 0 && (
              <>
                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={showJSON ? "secondary" : "ghost"}
                        size="icon"
                        className="text-muted-foreground"
                        onClick={() => setShowJSON(!showJSON)}
                      >
                        <Code className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{showJSON ? 'Hide JSON' : 'View JSON'}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <TooltipProvider>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground"
                        onClick={handleExport}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Export .excalidraw</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </>
            )}
          </div>
        </div>

        {/* Canvas (always visible) */}
        <div className="flex-1 relative overflow-hidden">
          <WireframePreview wireframe={wireframe} onElementsChange={onElementsChange} />

          {/* JSON Overlay */}
          {showJSON && (
            <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-20 flex flex-col">
              <div className="flex items-center justify-between px-4 py-2 border-b">
                <span className="text-sm font-medium">wireframe.excalidraw</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  onClick={() => setShowJSON(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <pre className="flex-1 p-4 text-xs font-mono overflow-auto whitespace-pre-wrap">
                {excalidrawJSON}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
