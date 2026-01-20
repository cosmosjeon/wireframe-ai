'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type UpgradePromptProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  reason?: string
  remaining?: number
}

export function UpgradePrompt({
  open,
  onOpenChange,
  reason,
  remaining = 0,
}: UpgradePromptProps) {
  const [loading, setLoading] = useState(false)

  async function handleUpgrade() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || '',
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

  async function handleBuyMore() {
    setLoading(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PACK_50 || '',
          mode: 'payment',
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">⚠️</span>
            Generation Limit Reached
          </DialogTitle>
          <DialogDescription>
            {reason || `You have ${remaining} generations remaining this month.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4 space-y-2">
            <h4 className="font-medium">Upgrade to Pro</h4>
            <p className="text-sm text-muted-foreground">
              Get 200 generations per month and premium features for $15/month
            </p>
            <Button
              onClick={handleUpgrade}
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Loading...' : 'Upgrade to Pro - $15/mo'}
            </Button>
          </div>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>
          <div className="rounded-lg border p-4 space-y-2">
            <h4 className="font-medium">Buy More Generations</h4>
            <p className="text-sm text-muted-foreground">
              Add 50 generations to your account for $5 (one-time purchase)
            </p>
            <Button
              variant="outline"
              onClick={handleBuyMore}
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Loading...' : 'Buy 50 Generations - $5'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
