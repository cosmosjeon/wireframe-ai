import { createBrowserClient } from '@supabase/ssr'

export const supabase = process.env.NEXT_PUBLIC_ENABLE_SUPABASE
  ? createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  : undefined
