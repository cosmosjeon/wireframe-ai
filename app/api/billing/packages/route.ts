import { NextResponse } from 'next/server'
import { getGenerationPackages } from '@/lib/billing'

export async function GET() {
  const packages = await getGenerationPackages()

  return NextResponse.json({ packages })
}
