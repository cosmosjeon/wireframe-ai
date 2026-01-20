'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'

import '@excalidraw/excalidraw/index.css'

const Excalidraw = dynamic(
  async () => {
    const mod = await import('@excalidraw/excalidraw')
    return mod.Excalidraw
  },
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full">Loading Excalidraw...</div> }
)

interface ExcalidrawCanvasProps {
  elements: any[]
  onElementsChange?: (elements: any[]) => void
}

// 요소 정규화 - 누락된 필수 속성 추가
function normalizeElement(el: any): any {
  if (!el || !el.type || !el.id) return null
  if (typeof el.x !== 'number' || typeof el.y !== 'number') return null

  // 기본값 설정
  const normalized = {
    ...el,
    backgroundColor: el.backgroundColor || 'transparent',
    strokeColor: el.strokeColor || '#000000',
    fillStyle: el.fillStyle || 'solid',
    strokeWidth: el.strokeWidth ?? 2,
    roughness: el.roughness ?? 1,
    opacity: el.opacity ?? 100,
    angle: el.angle ?? 0,
    groupIds: el.groupIds || [],
    frameId: el.frameId ?? null,
    roundness: el.roundness ?? null,
    isDeleted: el.isDeleted ?? false,
    boundElements: el.boundElements ?? null,
    link: el.link ?? null,
    locked: el.locked ?? false,
  }

  // 선형 요소(line, arrow)는 points 배열 필수
  if (el.type === 'line' || el.type === 'arrow') {
    if (!Array.isArray(el.points) || el.points.length < 2) return null
    for (const point of el.points) {
      if (!Array.isArray(point) || point.length < 2) return null
      if (typeof point[0] !== 'number' || typeof point[1] !== 'number') return null
    }
    return normalized
  }

  // 비선형 요소는 width, height 필수
  if (typeof el.width !== 'number' || typeof el.height !== 'number') return null

  // text 요소
  if (el.type === 'text') {
    if (typeof el.text !== 'string') return null
    return {
      ...normalized,
      fontSize: el.fontSize ?? 20,
      fontFamily: el.fontFamily ?? 1,
      textAlign: el.textAlign || 'left',
      verticalAlign: el.verticalAlign || 'top',
    }
  }

  // freedraw 요소
  if (el.type === 'freedraw') {
    if (!Array.isArray(el.points) || el.points.length === 0) return null
  }

  return normalized
}

export function ExcalidrawCanvas({ elements, onElementsChange }: ExcalidrawCanvasProps) {
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isUpdatingFromProps = useRef(false)
  const hasScrolledRef = useRef(false)
  const lastElementsRef = useRef<string>('')  // 이전 elements JSON 저장

  // 유효한 요소만 필터링 + 정규화
  const validElements = useMemo(() => {
    return elements.map(normalizeElement).filter(Boolean)
  }, [elements])

  // elements 변경 감지를 위한 JSON 문자열
  const elementsKey = useMemo(() => {
    return JSON.stringify(validElements.map(el => ({
      id: el.id,
      type: el.type,
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      backgroundColor: el.backgroundColor,
      strokeColor: el.strokeColor,
      text: el.text,
    })))
  }, [validElements])

  // debounced onChange handler
  const handleChange = useCallback((newElements: readonly any[], appState: any, files: any) => {
    // props에서 업데이트 중이면 무시 (무한 루프 방지)
    if (isUpdatingFromProps.current) return

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      onElementsChange?.([...newElements])
    }, 300)
  }, [onElementsChange])

  // props에서 elements 변경 시 캔버스 업데이트
  useEffect(() => {
    if (!excalidrawAPI) return

    // 실제 변경이 있는지 확인
    if (elementsKey === lastElementsRef.current) return
    lastElementsRef.current = elementsKey

    if (validElements.length > 0) {
      isUpdatingFromProps.current = true
      excalidrawAPI.updateScene({ elements: validElements })

      // 처음 요소가 생성될 때만 스크롤
      if (!hasScrolledRef.current) {
        excalidrawAPI.scrollToContent()
        hasScrolledRef.current = true
      }

      // 플래그 리셋 (더 긴 타임아웃)
      setTimeout(() => {
        isUpdatingFromProps.current = false
      }, 300)
    }
  }, [elementsKey, excalidrawAPI, validElements])

  // 요소가 비워지면 스크롤 플래그 리셋
  useEffect(() => {
    if (validElements.length === 0) {
      hasScrolledRef.current = false
      lastElementsRef.current = ''
    }
  }, [validElements.length])

  // cleanup
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  return (
    <div className="excalidraw-wrapper">
      <Excalidraw
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        initialData={{
          elements: validElements,
          appState: {
            viewBackgroundColor: '#ffffff',
            gridSize: 20,
          },
          scrollToContent: true,
        }}
        onChange={handleChange}
        theme="light"
        UIOptions={{
          canvasActions: {
            export: { saveFileToDisk: true },
          },
        }}
      />
    </div>
  )
}
