import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  console.log("in callback route")
  console.log("code", code)

  if (code) {
    const cookieStore = cookies()
    console.log("cookieStore", cookieStore)
    const supabase = createRouteHandlerClient(
      {
        cookies: () => cookieStore
      },
      {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
        supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      }
    )
    console.log("About to check code")
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(`/${next.slice(1)}`, req.url))
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(new URL("/auth/auth-code-error", req.url))
}
