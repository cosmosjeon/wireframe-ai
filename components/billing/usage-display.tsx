'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { UsageInfo } from '@/lib/types/billing'

type UsageDisplayProps = {
  className?: string
  compact?: boolean
}

export function UsageDisplay({ className, compact = false }: UsageDisplayProps) {
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUsage() {
      try {
        const res = await fetch('/api/billing/usage')
        if (res.ok) {
          const data = await res.json()
          setUsage(data.usage)
        }
      } catch (error) {
        console.error('Failed to fetch usage:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchUsage()
  }, [])

  if (loading) {
    return (
      <div className={cn('animate-pulse w-full', className)}>
        <div className="h-4 w-full bg-muted rounded" />
      </div>
    )
  }

  if (!usage) {
    return null
  }

  const percentage = Math.min(
    ((usage.used) / (usage.included + usage.purchased + usage.rollover)) * 100,
    100
  )

  const isLow = usage.remaining <= 10
  const isCritical = usage.remaining <= 3

  if (compact) {
    return (
      <div className={cn('w-full', className)}>
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-muted-foreground">Generations</span>
          <span
            className={cn(
              'font-medium',
              isCritical && 'text-destructive',
              isLow && !isCritical && 'text-yellow-600 dark:text-yellow-500'
            )}
          >
            {usage.remaining}
          </span>
        </div>
        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-300',
              isCritical
                ? 'bg-destructive'
                : isLow
                ? 'bg-yellow-500'
                : 'bg-primary'
            )}
            style={{ width: `${100 - percentage}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Generations</span>
        <span
          className={cn(
            'font-medium',
            isCritical && 'text-destructive',
            isLow && !isCritical && 'text-yellow-600 dark:text-yellow-500'
          )}
        >
          {usage.remaining} remaining
        </span>
      </div>
      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-300',
            isCritical
              ? 'bg-destructive'
              : isLow
              ? 'bg-yellow-500'
              : 'bg-primary'
          )}
          style={{ width: `${100 - percentage}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {usage.used} / {usage.included + usage.purchased + usage.rollover} used
        </span>
        <span className="capitalize">{usage.plan} plan</span>
      </div>
    </div>
  )
}
