import Stripe from 'stripe'

function getStripeClient(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-12-15.clover',
    typescript: true,
  })
}

export const stripe = getStripeClient()

export const STRIPE_PRICES = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY || '',
  team_monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY || '',
  team_yearly: process.env.STRIPE_PRICE_TEAM_YEARLY || '',
  pack_50: process.env.STRIPE_PRICE_PACK_50 || '',
  pack_150: process.env.STRIPE_PRICE_PACK_150 || '',
  pack_500: process.env.STRIPE_PRICE_PACK_500 || '',
  pack_2000: process.env.STRIPE_PRICE_PACK_2000 || '',
} as const

export function getPriceIdForPlan(
  planId: string,
  interval: 'month' | 'year'
): string {
  const key = `${planId}_${interval === 'month' ? 'monthly' : 'yearly'}` as keyof typeof STRIPE_PRICES
  return STRIPE_PRICES[key] || ''
}

export function getPriceIdForPackage(packageId: string): string {
  const key = packageId.replace('pack_', 'pack_') as keyof typeof STRIPE_PRICES
  return STRIPE_PRICES[key as keyof typeof STRIPE_PRICES] || ''
}

export function isStripeEnabled(): boolean {
  return stripe !== null
}
