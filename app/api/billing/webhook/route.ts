import { NextRequest, NextResponse } from 'next/server'
import { stripe, isStripeEnabled } from '@/lib/stripe'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  updateSubscriptionPlan,
  handleSubscriptionDeleted,
} from '@/lib/billing'
import { addGenerations } from '@/lib/usage'
import type { PlanId } from '@/lib/types/billing'
import Stripe from 'stripe'

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET

async function getUserIdFromCustomerId(
  customerId: string
): Promise<string | null> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null

  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single()

  return data?.user_id || null
}

async function getPackageGenerations(priceId: string): Promise<number> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return 0

  const { data } = await supabase
    .from('generation_packages')
    .select('generations')
    .eq('stripe_price_id', priceId)
    .single()

  return data?.generations || 0
}

async function getPlanIdFromPriceId(priceId: string): Promise<PlanId | null> {
  const supabase = await createServerSupabaseClient()
  if (!supabase) return null

  const { data } = await supabase
    .from('plans')
    .select('id')
    .or(`stripe_price_id_monthly.eq.${priceId},stripe_price_id_yearly.eq.${priceId}`)
    .single()

  return (data?.id as PlanId) || null
}

export async function POST(request: NextRequest) {
  if (!isStripeEnabled() || !stripe || !WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: 'Stripe webhook not configured' },
      { status: 500 }
    )
  }

  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.mode === 'subscription') {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          )
          const priceId = subscription.items.data[0]?.price.id
          const planId = await getPlanIdFromPriceId(priceId)
          const userId = session.metadata?.user_id

          if (userId && planId) {
            await updateSubscriptionPlan(userId, planId, subscription.id)
          }
        } else if (session.mode === 'payment') {
          const userId = session.metadata?.user_id
          const lineItems = await stripe.checkout.sessions.listLineItems(
            session.id
          )
          const priceId = lineItems.data[0]?.price?.id

          if (userId && priceId) {
            const generations = await getPackageGenerations(priceId)
            if (generations > 0) {
              await addGenerations(
                userId,
                generations,
                'purchase',
                `Purchased ${generations} generations`
              )

              const supabase = await createServerSupabaseClient()
              if (supabase) {
                await supabase.from('purchases').insert({
                  user_id: userId,
                  stripe_checkout_session_id: session.id,
                  stripe_payment_intent_id: session.payment_intent as string,
                  amount: session.amount_total || 0,
                  currency: session.currency || 'usd',
                  status: 'completed',
                  generations_granted: generations,
                })
              }
            }
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription & {
          current_period_start?: number
          current_period_end?: number
        }
        const customerId = stripeSub.customer as string
        const userId = await getUserIdFromCustomerId(customerId)

        if (userId) {
          const priceId = stripeSub.items.data[0]?.price.id
          const planId = await getPlanIdFromPriceId(priceId)

          if (planId) {
            await updateSubscriptionPlan(userId, planId, stripeSub.id)
          }

          const supabase = await createServerSupabaseClient()
          if (supabase) {
            const item = stripeSub.items.data[0]
            const periodStart = stripeSub.current_period_start || item?.current_period_start
            const periodEnd = stripeSub.current_period_end || item?.current_period_end

            await supabase
              .from('subscriptions')
              .update({
                status:
                  stripeSub.status === 'active' ? 'active' : 'past_due',
                cancel_at_period_end: stripeSub.cancel_at_period_end,
                ...(periodStart && {
                  current_period_start: new Date(periodStart * 1000).toISOString(),
                }),
                ...(periodEnd && {
                  current_period_end: new Date(periodEnd * 1000).toISOString(),
                }),
              })
              .eq('user_id', userId)
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription
        const customerId = stripeSub.customer as string
        const userId = await getUserIdFromCustomerId(customerId)

        if (userId) {
          await handleSubscriptionDeleted(userId)
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string
        const userId = await getUserIdFromCustomerId(customerId)

        if (userId) {
          const supabase = await createServerSupabaseClient()
          if (supabase) {
            await supabase
              .from('subscriptions')
              .update({ status: 'past_due' })
              .eq('user_id', userId)
          }
        }
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
