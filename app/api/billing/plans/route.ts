import { NextResponse } from 'next/server'
import { getPlans } from '@/lib/billing'

export async function GET() {
  const plans = await getPlans()

  return NextResponse.json({ plans })
}
