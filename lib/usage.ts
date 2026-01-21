import { createServerSupabaseClient } from '@/lib/supabase-server'
import type {
  UseGenerationResult,
  UseCreditsResult,
  DailyLimitResult,
  UsageEvent,
  CanUseCreditsResult,
} from '@/lib/types/billing'

// ============================================
// Credit-based functions (new system)
// ============================================

/**
 * Consume credits based on actual token usage
 * 1 credit = 1,000 tokens (rounded up)
 */
export async function consumeCredits(
  userId: string,
  promptTokens: number,
  completionTokens: number,
  conversationId?: string,
  model?: string,
  description?: string,
  idempotencyKey?: string
): Promise<UseCreditsResult> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) {
    return {
      success: false,
      credits_remaining: 0,
      credits_consumed: 0,
      error_message: 'Database connection failed',
    }
  }

  const { data, error } = await supabase.rpc('use_credits_for_tokens', {
    p_user_id: userId,
    p_prompt_tokens: promptTokens,
    p_completion_tokens: completionTokens,
    p_conversation_id: conversationId || null,
    p_model: model || null,
    p_description: description || null,
    p_idempotency_key: idempotencyKey || null,
  })

  if (error) {
    return {
      success: false,
      credits_remaining: 0,
      credits_consumed: 0,
      error_message: error.message,
    }
  }

  const result = data?.[0]
  return {
    success: result?.success ?? false,
    credits_remaining: result?.credits_remaining ?? 0,
    credits_consumed: result?.credits_consumed ?? 0,
    error_message: result?.error_message ?? null,
  }
}

/**
 * Add credits to user account (purchase, grant, etc.)
 */
export async function addCredits(
  userId: string,
  amount: number,
  type: 'purchase' | 'grant' | 'rollover' | 'refund' | 'subscription' = 'purchase',
  description?: string
): Promise<number> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return 0

  const { data, error } = await supabase.rpc('add_credits', {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_description: description || null,
  })

  if (error) {
    console.error('Failed to add credits:', error)
    return 0
  }

  return data ?? 0
}

/**
 * Get remaining credits for user
 */
export async function getCreditsRemaining(userId: string): Promise<number> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return 0

  const { data, error } = await supabase.rpc('get_credits_remaining', {
    p_user_id: userId,
  })

  if (error) return 0
  return data ?? 0
}

/**
 * Check if user can use credits (pre-request check)
 * estimatedTokens: expected token usage for the request
 */
export async function canUseCredits(
  userId: string,
  estimatedTokens: number = 1000
): Promise<CanUseCreditsResult> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) {
    return {
      allowed: false,
      credits_balance: 0,
      credits_needed: 0,
      reason: 'Database connection failed',
    }
  }

  const { data, error } = await supabase.rpc('can_use_credits', {
    p_user_id: userId,
    p_estimated_tokens: estimatedTokens,
  })

  if (error) {
    return {
      allowed: false,
      credits_balance: 0,
      credits_needed: 0,
      reason: error.message,
    }
  }

  const result = data?.[0]
  return {
    allowed: result?.allowed ?? false,
    credits_balance: result?.credits_balance ?? 0,
    credits_needed: result?.credits_needed ?? 0,
    reason: result?.reason ?? null,
  }
}

/**
 * Get credit usage statistics
 */
export async function getCreditUsageStats(userId: string): Promise<{
  credits_balance: number
  credits_used_total: number
  tokens_used_total: number
} | null> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null

  const { data, error } = await supabase
    .from('subscriptions')
    .select('credits_balance, credits_used_total, tokens_used_total')
    .eq('user_id', userId)
    .single()

  if (error || !data) return null
  return {
    credits_balance: data.credits_balance ?? 0,
    credits_used_total: data.credits_used_total ?? 0,
    tokens_used_total: data.tokens_used_total ?? 0,
  }
}

// ============================================
// Legacy generation-based functions (deprecated)
// Kept for backward compatibility
// ============================================

/**
 * @deprecated Use consumeCredits instead
 */
export async function consumeGeneration(
  userId: string,
  amount: number = 1,
  conversationId?: string,
  model?: string,
  description?: string,
  idempotencyKey?: string
): Promise<UseGenerationResult> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) {
    return {
      success: false,
      remaining: 0,
      error_message: 'Database connection failed',
    }
  }

  const { data, error } = await supabase.rpc('use_generation', {
    p_user_id: userId,
    p_amount: amount,
    p_conversation_id: conversationId || null,
    p_model: model || null,
    p_description: description || null,
    p_idempotency_key: idempotencyKey || null,
  })

  if (error) {
    return {
      success: false,
      remaining: 0,
      error_message: error.message,
    }
  }

  const result = data?.[0]
  return {
    success: result?.success ?? false,
    remaining: result?.remaining ?? 0,
    error_message: result?.error_message ?? null,
  }
}

/**
 * @deprecated Use addCredits instead
 */
export async function addGenerations(
  userId: string,
  amount: number,
  type: 'grant' | 'purchase' | 'rollover' | 'refund' = 'grant',
  description?: string
): Promise<number> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return 0

  const { data, error } = await supabase.rpc('add_generations', {
    p_user_id: userId,
    p_amount: amount,
    p_type: type,
    p_description: description || null,
  })

  if (error) {
    console.error('Failed to add generations:', error)
    return 0
  }

  return data ?? 0
}

/**
 * @deprecated Use getCreditsRemaining instead
 */
export async function getGenerationsRemaining(userId: string): Promise<number> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return 0

  const { data, error } = await supabase.rpc('get_generations_remaining', {
    p_user_id: userId,
  })

  if (error) return 0
  return data ?? 0
}

export async function checkDailyLimit(
  userId: string
): Promise<DailyLimitResult> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) {
    return { allowed: false, used_today: 0, daily_limit: null }
  }

  const { data, error } = await supabase.rpc('check_daily_limit', {
    p_user_id: userId,
  })

  if (error) {
    return { allowed: false, used_today: 0, daily_limit: null }
  }

  const result = data?.[0]
  return {
    allowed: result?.allowed ?? false,
    used_today: result?.used_today ?? 0,
    daily_limit: result?.daily_limit ?? null,
  }
}

/**
 * @deprecated Use canUseCredits instead
 */
export async function canUseGeneration(
  userId: string,
  amount: number = 1
): Promise<{ allowed: boolean; reason?: string }> {
  const remaining = await getGenerationsRemaining(userId)

  if (remaining < amount) {
    return {
      allowed: false,
      reason: `Insufficient generations. You have ${remaining} remaining but need ${amount}.`,
    }
  }

  const dailyCheck = await checkDailyLimit(userId)

  if (!dailyCheck.allowed && dailyCheck.daily_limit !== null) {
    return {
      allowed: false,
      reason: `Daily limit reached. You've used ${dailyCheck.used_today}/${dailyCheck.daily_limit} today.`,
    }
  }

  return { allowed: true }
}

export async function getUsageHistory(
  userId: string,
  limit: number = 50
): Promise<UsageEvent[]> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('usage_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data as UsageEvent[]
}

export async function getTodayUsage(userId: string): Promise<number> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('usage_events')
    .select('generations_delta')
    .eq('user_id', userId)
    .eq('event_type', 'generation')
    .gte('created_at', today.toISOString())

  if (error || !data) return 0

  return data.reduce(
    (sum, event) => sum + Math.abs(event.generations_delta),
    0
  )
}

/**
 * Get today's token usage
 */
export async function getTodayTokenUsage(userId: string): Promise<{
  tokens: number
  credits: number
}> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return { tokens: 0, credits: 0 }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('usage_events')
    .select('total_tokens, credits_consumed')
    .eq('user_id', userId)
    .eq('event_type', 'token_usage')
    .gte('created_at', today.toISOString())

  if (error || !data) return { tokens: 0, credits: 0 }

  return data.reduce(
    (sum, event) => ({
      tokens: sum.tokens + (event.total_tokens || 0),
      credits: sum.credits + Math.abs(event.credits_consumed || 0),
    }),
    { tokens: 0, credits: 0 }
  )
}
