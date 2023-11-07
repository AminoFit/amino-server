export const dynamic = "force-dynamic"

import { QuickLogMessage } from "@/app/api/processMessage"
import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  request: NextRequest // needed so we don't cache this request
) {
  console.log("QUICK LOG POST request")

  const { aminoUser, error } = await GetAminoUserOnRequest()

  if (error) {
    return new Response(error, { status: 400 })
  }

  const { message } = await request.json()

  if (!message) {
    return new Response("No message provided", { status: 400 })
  }

  if (!aminoUser) {
    return new Response("No amino user found?", { status: 400 })
  }

  const messageResult = await QuickLogMessage(aminoUser, message)

  return NextResponse.json(messageResult)
}
