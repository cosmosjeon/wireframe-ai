'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { UsageDisplay } from '@/components/billing/usage-display'
import type {
  UsageInfo,
  Subscription,
  Plan,
  GenerationPackage,
} from '@/lib/types/billing'

function BillingSettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [usage, setUsage] = useState<UsageInfo | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [packages, setPackages] = useState<GenerationPackage[]>([])
  const [loading, setLoading] = useState(false)

  const success = searchParams.get('success')
  const canceled = searchParams.get('canceled')

  useEffect(() => {
    async function fetchData() {
      const [usageRes, packagesRes] = await Promise.all([
        fetch('/api/billing/usage'),
        fetch('/api/billing/packages'),
      ])

      if (usageRes.ok) {
        const data = await usageRes.json()
        setUsage(data.usage)
        setSubscription(data.subscription)
        setPlan(data.plan)
      }

      if (packagesRes.ok) {
        const { packages } = await packagesRes.json()
        setPackages(packages)
      }
    }

    fetchData()
  }, [])

  async function handleManageSubscription() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      if (res.ok) {
        const { url } = await res.json()
        window.location.href = url
      }
    } catch (error) {
      console.error('Failed to open billing portal:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleBuyPackage(pkg: GenerationPackage) {
    if (!pkg.stripe_price_id) return
    setLoading(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: pkg.stripe_price_id,
          mode: 'payment',
          metadata: { package_id: pkg.id },
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
    <div className="container max-w-4xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Billing & Usage</h1>
        <p className="text-muted-foreground mt-2">
          Manage your subscription and usage
        </p>
      </div>

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-green-800 dark:text-green-200">
            Payment successful! Your account has been updated.
          </p>
        </div>
      )}

      {canceled && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-yellow-800 dark:text-yellow-200">
            Payment was canceled. No changes were made to your account.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
          <CardDescription>
            {plan?.name || 'Free'} - {plan?.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <UsageDisplay />
          <div className="flex gap-4">
            <Button onClick={() => router.push('/pricing')}>
              {plan?.id === 'free' ? 'Upgrade Plan' : 'Change Plan'}
            </Button>
            {subscription?.stripe_subscription_id && (
              <Button
                variant="outline"
                onClick={handleManageSubscription}
                disabled={loading}
              >
                Manage Subscription
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buy Additional Generations</CardTitle>
          <CardDescription>
            One-time purchase, never expires
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {packages.map((pkg) => (
              <div
                key={pkg.id}
                className="border rounded-lg p-4 space-y-2 hover:border-primary transition-colors"
              >
                <div className="font-medium">{pkg.name}</div>
                <div className="text-2xl font-bold">
                  ${(pkg.price / 100).toFixed(0)}
                </div>
                <div className="text-sm text-muted-foreground">
                  ${((pkg.price / 100) / pkg.generations).toFixed(2)}/generation
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleBuyPackage(pkg)}
                  disabled={loading || !pkg.stripe_price_id}
                >
                  Buy Now
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing History</CardTitle>
          <CardDescription>
            View and download your invoices
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscription?.stripe_customer_id ? (
            <Button
              variant="outline"
              onClick={handleManageSubscription}
              disabled={loading}
            >
              View Invoices in Stripe Portal
            </Button>
          ) : (
            <p className="text-muted-foreground">
              No billing history available
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default function BillingSettingsPage() {
  return (
    <Suspense fallback={<div className="container max-w-4xl py-8">Loading...</div>}>
      <BillingSettingsContent />
    </Suspense>
  )
}
