import { createClient } from "@/utils/supabase/server"
import { type NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()

  // Check if we have a session
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    await supabase.auth.signOut({ scope: "local" })
  }

  return NextResponse.redirect(new URL('/', req.url), {
    status: 302,
  })
}
