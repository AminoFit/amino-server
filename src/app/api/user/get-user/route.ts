export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"

import { createServerActionClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function GET(
  _request: Request, // needed so we don't cache this request
  { params }: { params: { date: string } }
) {
  const supabase = createServerActionClient({ cookies })
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response("User not found", { status: 404 })
  }
  const { error, data: aminoUser } = await supabase.from("User").select().eq("id", user.id).single()

  return NextResponse.json(aminoUser)
}
