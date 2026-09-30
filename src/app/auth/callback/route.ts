import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { type CookieOptions, createServerClient } from '@supabase/ssr'
import { safeNextPath } from '@/app/login/nextPath'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  console.log(`auth callback with code ${searchParams.get('code')}`)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = safeNextPath(searchParams.get('next')) ?? '/'

  if (code) {
    console.log("auth callback with code")
    const cookieStore = cookies()
    console.log("cookieStore", cookieStore)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete({ name, ...options })
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Back to the sign-in page, which says it didn't work (there is no separate error page).
  return NextResponse.redirect(`${origin}/login?error=google`)
}