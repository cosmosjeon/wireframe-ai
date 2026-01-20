import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { getUsageInfo, getSubscriptionWithPlan } from '@/lib/billing'
import { getUsageHistory, getTodayUsage } from '@/lib/usage'

export async function GET() {
  const supabase = await createServerSupabaseClient()

  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase not configured' },
      { status: 500 }
    )
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [usage, subscription, todayUsage] = await Promise.all([
    getUsageInfo(user.id),
    getSubscriptionWithPlan(user.id),
    getTodayUsage(user.id),
  ])

  if (!usage || !subscription) {
    return NextResponse.json(
      { error: 'Subscription not found' },
      { status: 404 }
    )
  }

  return NextResponse.json({
    usage: {
      ...usage,
      daily_used: todayUsage,
    },
    subscription,
    plan: subscription.plan,
  })
}
