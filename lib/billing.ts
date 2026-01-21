import { createServerSupabaseClient } from '@/lib/supabase-server'
import { stripe, getPriceIdForPlan, isStripeEnabled } from '@/lib/stripe'
import type {
  Subscription,
  SubscriptionWithPlan,
  Plan,
  UsageInfo,
  CreditUsageInfo,
  GenerationPackage,
  CreditPackage,
  PlanId,
} from '@/lib/types/billing'

export async function getSubscription(
  userId: string
): Promise<Subscription | null> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) return null
  return data as Subscription
}

export async function getSubscriptionWithPlan(
  userId: string
): Promise<SubscriptionWithPlan | null> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('subscriptions')
    .select(
      `
      *,
      plan:plans(*)
    `
    )
    .eq('user_id', userId)
    .single()

  if (error || !data) return null

  return {
    ...data,
    plan: data.plan as Plan,
  } as SubscriptionWithPlan
}

export async function getPlans(): Promise<Plan[]> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true })

  if (error || !data) return []
  return data as Plan[]
}

// ============================================
// Legacy generation packages (deprecated)
// ============================================

/** @deprecated Use getCreditPackages instead */
export async function getGenerationPackages(): Promise<GenerationPackage[]> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('generation_packages')
    .select('*')
    .eq('is_active', true)
    .order('price', { ascending: true })

  if (error || !data) return []
  return data as GenerationPackage[]
}

// ============================================
// Credit-based billing functions
// ============================================

/**
 * Get available credit packages
 */
export async function getCreditPackages(): Promise<CreditPackage[]> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('credit_packages')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error || !data) return []
  return data as CreditPackage[]
}

/**
 * Get credit usage info for a user
 */
export async function getCreditUsageInfo(userId: string): Promise<CreditUsageInfo | null> {
  const subscription = await getSubscriptionWithPlan(userId)
  if (!subscription) return null

  return {
    credits_balance: subscription.credits_balance ?? 0,
    credits_used_total: subscription.credits_used_total ?? 0,
    tokens_used_total: subscription.tokens_used_total ?? 0,
    plan: subscription.plan_id,
    plan_credits_per_month: subscription.plan.credits_per_month ?? 0,
    period_end: subscription.current_period_end,
  }
}

/** @deprecated Use getCreditUsageInfo instead */
export async function getUsageInfo(userId: string): Promise<UsageInfo | null> {
  const subscription = await getSubscriptionWithPlan(userId)
  if (!subscription) return null

  const remaining =
    subscription.generations_included +
    subscription.generations_purchased +
    subscription.generations_rollover -
    subscription.generations_used

  return {
    used: subscription.generations_used,
    included: subscription.generations_included,
    purchased: subscription.generations_purchased,
    rollover: subscription.generations_rollover,
    remaining: Math.max(remaining, 0),
    plan: subscription.plan_id,
    period_end: subscription.current_period_end,
    daily_limit: subscription.plan.daily_limit,
  }
}

export async function createOrGetStripeCustomer(
  userId: string,
  email: string
): Promise<string | null> {
  if (!isStripeEnabled() || !stripe) return null

  const subscription = await getSubscription(userId)

  if (subscription?.stripe_customer_id) {
    return subscription.stripe_customer_id
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { user_id: userId },
  })

  const supabase = await createServerSupabaseClient()
  if (supabase) {
    await supabase
      .from('subscriptions')
      .update({ stripe_customer_id: customer.id })
      .eq('user_id', userId)
  }

  return customer.id
}

export async function createCheckoutSession(
  userId: string,
  email: string,
  priceId: string,
  mode: 'subscription' | 'payment',
  successUrl: string,
  cancelUrl: string,
  metadata?: Record<string, string>
): Promise<string | null> {
  if (!isStripeEnabled() || !stripe) return null

  const customerId = await createOrGetStripeCustomer(userId, email)
  if (!customerId) return null

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      user_id: userId,
      ...metadata,
    },
  })

  return session.url
}

export async function createPortalSession(
  userId: string
): Promise<string | null> {
  if (!isStripeEnabled() || !stripe) return null

  const subscription = await getSubscription(userId)
  if (!subscription?.stripe_customer_id) return null

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_SITE_URL || ''}/settings/billing`,
  })

  return session.url
}

export async function updateSubscriptionPlan(
  userId: string,
  newPlanId: PlanId,
  stripeSubscriptionId?: string
): Promise<boolean> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return false

  const { data: plan } = await supabase
    .from('plans')
    .select('generations_per_month, credits_per_month')
    .eq('id', newPlanId)
    .single()

  if (!plan) return false

  const { error } = await supabase
    .from('subscriptions')
    .update({
      plan_id: newPlanId,
      generations_included: plan.generations_per_month,
      credits_balance: plan.credits_per_month,
      stripe_subscription_id: stripeSubscriptionId,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return !error
}

export async function cancelSubscription(userId: string): Promise<boolean> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return false

  const { error } = await supabase
    .from('subscriptions')
    .update({
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return !error
}

export async function handleSubscriptionDeleted(
  userId: string
): Promise<boolean> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return false

  const { data: freePlan } = await supabase
    .from('plans')
    .select('generations_per_month, credits_per_month')
    .eq('id', 'free')
    .single()

  const { error } = await supabase
    .from('subscriptions')
    .update({
      plan_id: 'free',
      status: 'active',
      stripe_subscription_id: null,
      generations_included: freePlan?.generations_per_month || 20,
      generations_used: 0,
      generations_purchased: 0,
      generations_rollover: 0,
      credits_balance: freePlan?.credits_per_month || 20,
      cancel_at_period_end: false,
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  return !error
}

/**
 * Grant credits to user after purchase
 */
export async function grantCreditsForPurchase(
  userId: string,
  credits: number,
  packageId: string
): Promise<boolean> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return false

  // Use RPC to atomically add credits
  const { error } = await supabase.rpc('add_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_type: 'purchase',
    p_description: `Purchased credit package: ${packageId}`,
  })

  return !error
}

/**
 * Get credit package by ID
 */
export async function getCreditPackageById(packageId: string): Promise<CreditPackage | null> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('credit_packages')
    .select('*')
    .eq('id', packageId)
    .single()

  if (error || !data) return null
  return data as CreditPackage
}
