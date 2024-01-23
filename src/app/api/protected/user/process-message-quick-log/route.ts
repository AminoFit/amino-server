export const dynamic = "force-dynamic"

import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { NextRequest, NextResponse } from "next/server"
import { GenerateResponseForQuickLog } from "@/languageModelProviders/openai/legacy/RespondToMessage"

export async function POST(
  request: NextRequest // needed so we don't cache this request
) {
  console.log("QUICK LOG MESSAGE PROCESS POST request")

  const { aminoUser, error } = await GetAminoUserOnRequest()

  if (error) {
    return new Response(error, { status: 400 })
  }

  const { messageId } = await request.json()

  if (!messageId || typeof messageId !== "number") {
    return new Response("Invalid message ID provided", { status: 400 })
}

  if (!aminoUser) {
    return new Response("No amino user found?", { status: 400 })
  }

  // const messageResult = await QuickLogMessage(aminoUser, message)
  let responseMessage = await GenerateResponseForQuickLog(aminoUser, messageId as number)

  return NextResponse.json(responseMessage)
}