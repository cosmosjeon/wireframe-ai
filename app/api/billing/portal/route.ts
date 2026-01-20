import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { createPortalSession } from '@/lib/billing'
import { isStripeEnabled } from '@/lib/stripe'

export async function POST() {
  if (!isStripeEnabled()) {
    return NextResponse.json(
      { error: 'Stripe not configured' },
      { status: 500 }
    )
  }

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

  const url = await createPortalSession(user.id)

  if (!url) {
    return NextResponse.json(
      { error: 'Failed to create portal session. No active subscription.' },
      { status: 400 }
    )
  }

  return NextResponse.json({ url })
}
