import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { safeNextPath } from '@/app/login/nextPath'

// Google sign-in returns here with a code to exchange for a session (written to cookies by the server client).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  const next = safeNextPath(searchParams.get('next')) ?? '/'

  if (code) {
    const { error } = await createClient().auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Back to the sign-in page, which says it didn't work (there is no separate error page).
  return NextResponse.redirect(`${origin}/login?error=google`)
}
