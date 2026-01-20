'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Plan, PlanId } from '@/lib/types/billing'

type PlanCardProps = {
  plan: Plan
  currentPlan?: PlanId
  interval: 'month' | 'year'
  onSelect?: (planId: PlanId, priceId: string) => void
  loading?: boolean
}

export function PlanCard({
  plan,
  currentPlan,
  interval,
  onSelect,
  loading,
}: PlanCardProps) {
  const isCurrent = currentPlan === plan.id
  const price =
    interval === 'month' ? plan.price_monthly : (plan.price_yearly || plan.price_monthly * 12)
  const priceId =
    interval === 'month'
      ? plan.stripe_price_id_monthly
      : plan.stripe_price_id_yearly

  const displayPrice = price / 100
  const monthlyPrice = interval === 'year' ? displayPrice / 12 : displayPrice

  return (
    <Card
      className={cn(
        'relative',
        isCurrent && 'border-primary ring-2 ring-primary ring-offset-2',
        plan.id === 'pro' && 'border-primary/50'
      )}
    >
      {plan.id === 'pro' && !isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
            Most Popular
          </span>
        </div>
      )}
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{plan.name}</span>
          {isCurrent && (
            <span className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded">
              Current
            </span>
          )}
        </CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          {plan.id === 'enterprise' ? (
            <span className="text-3xl font-bold">Custom</span>
          ) : (
            <>
              <span className="text-3xl font-bold">${monthlyPrice.toFixed(0)}</span>
              <span className="text-muted-foreground">/month</span>
              {interval === 'year' && plan.price_yearly && (
                <p className="text-sm text-muted-foreground mt-1">
                  Billed annually (${displayPrice}/year)
                </p>
              )}
            </>
          )}
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {plan.generations_per_month === 999999
              ? 'Unlimited'
              : plan.generations_per_month.toLocaleString()}{' '}
            generations/month
          </p>
          {plan.daily_limit && (
            <p className="text-sm text-muted-foreground">
              {plan.daily_limit} per day limit
            </p>
          )}
        </div>
        <ul className="space-y-2 text-sm">
          {plan.features.map((feature, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-primary">✓</span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter>
        {plan.id === 'enterprise' ? (
          <Button variant="outline" className="w-full" asChild>
            <a href="mailto:contact@vibeframe.ai">Contact Sales</a>
          </Button>
        ) : plan.id === 'free' ? (
          <Button variant="outline" className="w-full" disabled={isCurrent}>
            {isCurrent ? 'Current Plan' : 'Downgrade'}
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={isCurrent || loading || !priceId}
            onClick={() => priceId && onSelect?.(plan.id, priceId)}
          >
            {loading
              ? 'Loading...'
              : isCurrent
              ? 'Current Plan'
              : `Upgrade to ${plan.name}`}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
