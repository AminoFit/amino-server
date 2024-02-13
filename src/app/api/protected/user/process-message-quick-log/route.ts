export const dynamic = "force-dynamic"

import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { NextRequest, NextResponse } from "next/server"
import { GenerateResponseForQuickLog } from "@/foodMessageProcessing/RespondToMessage"

export async function POST(
  request: NextRequest // needed so we don't cache this request
) {
  console.log("QUICK LOG MESSAGE PROCESS POST request")

  const requestBody = await request.json()
  console.log("Request body: ", requestBody) 
  const { messageId } = requestBody
  const consumedOn = requestBody.consumedOn || new Date().toISOString()
  const isMessageBeingEdited = requestBody.isMessageBeingEdited || false

  const { aminoUser, error: aminoUserError } = await GetAminoUserOnRequest()

  if (aminoUserError) {
    console.error("Error getting amino user on request: ", aminoUserError)
    return new Response(aminoUserError, { status: 400 })
  }



  if (!messageId || typeof messageId !== "number") {
    return new Response("Invalid message ID provided", { status: 400 })
  }

  if (!aminoUser) {
    return new Response("No amino user found?", { status: 400 })
  }

  // const messageResult = await QuickLogMessage(aminoUser, message)
  let responseMessage = await GenerateResponseForQuickLog(
    aminoUser,
    messageId as number,
    consumedOn,
    isMessageBeingEdited
  )

  return NextResponse.json(responseMessage)
}
