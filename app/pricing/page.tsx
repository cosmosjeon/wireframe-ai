'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PlanCard } from '@/components/billing/plan-card'
import type { Plan, PlanId } from '@/lib/types/billing'

export default function PricingPage() {
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [currentPlan, setCurrentPlan] = useState<PlanId | null>(null)
  const [interval, setInterval] = useState<'month' | 'year'>('month')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const [plansRes, usageRes] = await Promise.all([
        fetch('/api/billing/plans'),
        fetch('/api/billing/usage'),
      ])

      if (plansRes.ok) {
        const { plans } = await plansRes.json()
        setPlans(plans)
      }

      if (usageRes.ok) {
        const { usage } = await usageRes.json()
        setCurrentPlan(usage?.plan || null)
      }
    }

    fetchData()
  }, [])

  async function handleSelectPlan(planId: PlanId, priceId: string) {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          mode: 'subscription',
        }),
      })

      if (res.ok) {
        const { url } = await res.json()
        window.location.href = url
      }
    } catch (error) {
      console.error('Failed to create checkout session:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container max-w-6xl py-12">
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl font-bold">Simple, transparent pricing</h1>
        <p className="text-xl text-muted-foreground">
          Choose the plan that works for you
        </p>
        <div className="flex items-center justify-center gap-4">
          <Button
            variant={interval === 'month' ? 'default' : 'ghost'}
            onClick={() => setInterval('month')}
          >
            Monthly
          </Button>
          <Button
            variant={interval === 'year' ? 'default' : 'ghost'}
            onClick={() => setInterval('year')}
          >
            Yearly
            <span className="ml-2 text-xs bg-primary-foreground/20 px-2 py-0.5 rounded">
              Save 20%
            </span>
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            currentPlan={currentPlan || undefined}
            interval={interval}
            onSelect={handleSelectPlan}
            loading={loading}
          />
        ))}
      </div>

      <div className="mt-16 text-center space-y-4">
        <h2 className="text-2xl font-bold">Need more generations?</h2>
        <p className="text-muted-foreground">
          Purchase additional generations anytime without changing your plan
        </p>
        <Button variant="outline" onClick={() => router.push('/settings/billing')}>
          Buy Additional Generations
        </Button>
      </div>
    </div>
  )
}
