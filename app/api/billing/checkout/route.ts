import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { createCheckoutSession } from '@/lib/billing'
import { isStripeEnabled } from '@/lib/stripe'
import type { CheckoutSessionRequest } from '@/lib/types/billing'

export async function POST(request: NextRequest) {
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

  if (userError || !user || !user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: CheckoutSessionRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { priceId, mode, successUrl, cancelUrl, metadata } = body

  if (!priceId || !mode) {
    return NextResponse.json(
      { error: 'priceId and mode are required' },
      { status: 400 }
    )
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin

  const url = await createCheckoutSession(
    user.id,
    user.email,
    priceId,
    mode,
    successUrl || `${baseUrl}/settings/billing?success=true`,
    cancelUrl || `${baseUrl}/settings/billing?canceled=true`,
    metadata
  )

  if (!url) {
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }

  return NextResponse.json({ url })
}
