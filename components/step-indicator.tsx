'use client'

import { z } from 'zod'
import { wireframeStepSchema } from '@/lib/schema'

type WireframeStep = z.infer<typeof wireframeStepSchema>

interface PhaseConfig {
  phase: number
  label: string
  steps: WireframeStep[]
}

const PHASES: PhaseConfig[] = [
  {
    phase: 0,
    label: '프로파일링',
    steps: ['profile_role', 'profile_purpose', 'profile_mode']
  },
  {
    phase: 1,
    label: '서비스 이해',
    steps: ['service_platform', 'service_type', 'service_description', 'service_goal', 'service_target', 'service_context']
  },
  {
    phase: 2,
    label: '첫인상 설계',
    steps: ['impression_feeling', 'impression_action', 'impression_info']
  },
  {
    phase: 3,
    label: '콘텐츠 구성',
    steps: ['content_sections', 'content_features', 'content_pricing']
  },
  {
    phase: 4,
    label: '네비게이션',
    steps: ['nav_menu', 'nav_header', 'nav_footer']
  },
  {
    phase: 5,
    label: '플랫폼 특화',
    steps: ['platform_mobile_nav', 'platform_mobile_bottom', 'platform_mobile_fab', 'platform_dashboard', 'platform_dashboard_chart', 'platform_ecommerce', 'platform_ecommerce_card']
  },
  {
    phase: 6,
    label: '스타일',
    steps: ['style_tone', 'style_density', 'style_corners', 'style_theme']
  },
  {
    phase: 7,
    label: '최종 확인',
    steps: ['final_confirm', 'building']
  }
]

function getPhaseForStep(step: WireframeStep): PhaseConfig | null {
  return PHASES.find(p => p.steps.includes(step)) || null
}

function getStepIndexInPhase(step: WireframeStep, phase: PhaseConfig): number {
  return phase.steps.indexOf(step)
}

interface StepIndicatorProps {
  currentStep: WireframeStep
  className?: string
}

export function StepIndicator({ currentStep, className = '' }: StepIndicatorProps) {
  const isComplete = currentStep === 'complete'
  const currentPhase = getPhaseForStep(currentStep)
  
  if (!currentPhase && !isComplete) {
    return null
  }

  const totalPhases = PHASES.length
  const currentPhaseIndex = currentPhase?.phase ?? totalPhases
  const progress = isComplete ? 100 : (currentPhaseIndex / totalPhases) * 100

  return (
    <div className={`px-4 py-3 bg-gray-50 border-b border-gray-200 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          {isComplete ? (
            <span className="text-gray-900">완료!</span>
          ) : currentPhase ? (
            <span>
              Phase {currentPhase.phase + 1}: {currentPhase.label}
            </span>
          ) : (
            <span>처리 중...</span>
          )}
        </span>
        <span className="text-xs text-gray-400">
          {isComplete ? '100%' : `${Math.round(progress)}%`}
        </span>
      </div>
      
      <div className="flex gap-1">
        {PHASES.map((phase, idx) => {
          const isCurrentPhase = currentPhase?.phase === idx
          const isPastPhase = currentPhaseIndex > idx
          const isCompletedPhase = isComplete || isPastPhase
          
          return (
            <div
              key={phase.phase}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                isCompletedPhase
                  ? 'bg-gray-900'
                  : isCurrentPhase
                  ? 'bg-gray-500'
                  : 'bg-gray-200'
              }`}
              title={`Phase ${phase.phase + 1}: ${phase.label}`}
            />
          )
        })}
      </div>

      {currentPhase && !isComplete && (
        <div className="flex gap-1 mt-1">
          {currentPhase.steps.map((step, idx) => {
            const stepIndex = getStepIndexInPhase(currentStep, currentPhase)
            const isPastStep = idx < stepIndex
            const isCurrentStep = idx === stepIndex
            
            return (
              <div
                key={step}
                className={`h-0.5 flex-1 rounded-full ${
                  isPastStep
                    ? 'bg-gray-700'
                    : isCurrentStep
                    ? 'bg-gray-500'
                    : 'bg-gray-200'
                }`}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
