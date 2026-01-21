import { NextResponse } from 'next/server'
import { getCreditPackages } from '@/lib/billing'
import type { CreditPackagesResponse } from '@/lib/types/billing'

export async function GET() {
  try {
    const packages = await getCreditPackages()

    return NextResponse.json<CreditPackagesResponse>({ packages })
  } catch (error) {
    console.error('Error fetching credit packages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch credit packages' },
      { status: 500 }
    )
  }
}
