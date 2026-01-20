export type PlanId = 'free' | 'pro' | 'team' | 'enterprise'
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused'
export type UsageEventType = 'generation' | 'question' | 'refund' | 'grant' | 'reset'
export type PurchaseStatus = 'pending' | 'completed' | 'failed' | 'refunded'

export type Plan = {
  id: PlanId
  name: string
  description: string | null
  price_monthly: number
  price_yearly: number | null
  generations_per_month: number
  daily_limit: number | null
  max_projects: number | null
  features: string[]
  stripe_price_id_monthly: string | null
  stripe_price_id_yearly: string | null
  is_active: boolean
  created_at: string
}

export type Subscription = {
  id: string
  user_id: string
  plan_id: PlanId
  status: SubscriptionStatus
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  trial_end: string | null
  generations_used: number
  generations_included: number
  generations_purchased: number
  generations_rollover: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type SubscriptionWithPlan = Subscription & {
  plan: Plan
}

export type UsageEvent = {
  id: string
  user_id: string
  subscription_id: string | null
  event_type: UsageEventType
  generations_delta: number
  generations_after: number
  conversation_id: string | null
  model_used: string | null
  description: string | null
  metadata: Record<string, unknown>
  idempotency_key: string | null
  created_at: string
}

export type GenerationPackage = {
  id: string
  name: string
  generations: number
  price: number
  stripe_price_id: string | null
  is_active: boolean
  created_at: string
}

export type Purchase = {
  id: string
  user_id: string
  package_id: string | null
  stripe_payment_intent_id: string | null
  stripe_checkout_session_id: string | null
  amount: number
  currency: string
  status: PurchaseStatus
  generations_granted: number
  created_at: string
}

export type UsageInfo = {
  used: number
  included: number
  purchased: number
  rollover: number
  remaining: number
  plan: PlanId
  period_end: string
  daily_used?: number
  daily_limit?: number | null
}

export type UseGenerationResult = {
  success: boolean
  remaining: number
  error_message: string | null
}

export type DailyLimitResult = {
  allowed: boolean
  used_today: number
  daily_limit: number | null
}

export type CheckoutSessionRequest = {
  priceId: string
  mode: 'subscription' | 'payment'
  successUrl?: string
  cancelUrl?: string
  metadata?: Record<string, string>
}

export type CheckoutSessionResponse = {
  url: string
  sessionId: string
}

export type PortalSessionResponse = {
  url: string
}

export type UsageResponse = {
  usage: UsageInfo
  subscription: Subscription
  plan: Plan
}

export type PlansResponse = {
  plans: Plan[]
}

export type PackagesResponse = {
  packages: GenerationPackage[]
}
