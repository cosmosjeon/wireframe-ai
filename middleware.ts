import { kv } from '@vercel/kv'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  // Handle KV redirect for /s/:path*
  if (req.nextUrl.pathname.startsWith('/s/')) {
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
      const id = req.nextUrl.pathname.split('/').pop()
      const url = await kv.get(`fragment:${id}`)

      if (url) {
        return NextResponse.redirect(url as string)
      } else {
        return NextResponse.redirect(new URL('/', req.url))
      }
    }
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Handle Supabase session refresh for all other routes
  let supabaseResponse = NextResponse.next({
    request: req,
  })

  if (process.env.NEXT_PUBLIC_ENABLE_SUPABASE) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              req.cookies.set(name, value)
            )
            supabaseResponse = NextResponse.next({
              request: req,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // Refresh session if expired
    await supabase.auth.getUser()
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/s/:path*',
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
