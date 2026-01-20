import { createServerSupabaseClient } from '@/lib/supabase-server'
import type {
  UseGenerationResult,
  DailyLimitResult,
  UsageEvent,
} from '@/lib/types/billing'

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
