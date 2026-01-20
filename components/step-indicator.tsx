'use client'

import { z } from 'zod'
import { wireframeStepSchema } from '@/lib/schema'

type WireframeStep = z.infer<typeof wireframeStepSchema>

const STEP_CONFIG: Record<WireframeStep, { index: number; label: string }> = {
  contextual_analysis: { index: 0, label: 'Analyzing Request' },
  wireframe_type_selection: { index: 1, label: 'Select Type' },
  requirements_gathering: { index: 2, label: 'Requirements' },
  theme_detection: { index: 3, label: 'Checking Theme' },
  theme_selection: { index: 4, label: 'Select Theme' },
  structure_planning: { index: 5, label: 'Planning Structure' },
  resource_loading: { index: 6, label: 'Loading Resources' },
  element_building: { index: 7, label: 'Building Elements' },
  optimization: { index: 8, label: 'Optimizing' },
  json_validation: { index: 9, label: 'Validating JSON' },
  content_validation: { index: 10, label: 'Final Validation' },
  complete: { index: 11, label: 'Complete' },
}

const TOTAL_STEPS = 11 // Excluding 'complete'

interface StepIndicatorProps {
  currentStep: WireframeStep
  className?: string
}

export function StepIndicator({ currentStep, className = '' }: StepIndicatorProps) {
  const config = STEP_CONFIG[currentStep]
  const isComplete = currentStep === 'complete'

  // config가 없으면 렌더링하지 않음
  if (!config && !isComplete) {
    return null
  }

  const progress = isComplete ? 100 : (config?.index ?? 0) / TOTAL_STEPS * 100

  return (
    <div className={`px-4 py-2 bg-gray-50 border-b border-gray-200 ${className}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">
          {isComplete ? (
            <span className="text-green-600">Complete</span>
          ) : config ? (
            <>Step {config.index + 1}/{TOTAL_STEPS + 1}: {config.label}</>
          ) : (
            <>Processing...</>
          )}
        </span>
        <span className="text-xs text-gray-500">{Math.round(progress)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            isComplete ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
