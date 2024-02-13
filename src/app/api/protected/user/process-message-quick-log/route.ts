export const dynamic = "force-dynamic"

import { GetAminoUserOnRequest } from "@/utils/supabase/GetUserFromRequest"
import { NextRequest, NextResponse } from "next/server"
import { GenerateResponseForQuickLog } from "@/foodMessageProcessing/RespondToMessage"

export async function POST(
  request: NextRequest // needed so we don't cache this request
) {
  console.log("QUICK LOG MESSAGE PROCESS POST request")

  const { aminoUser, error } = await GetAminoUserOnRequest()

  if (error) {
    console.log("request", JSON.stringify(request))
    console.error("Error getting amino user on request: ", error)
    return new Response(error, { status: 400 })
  }

  const requestBody = await request.json();
  console.log(requestBody)
  const { messageId } = requestBody;
  // Default consumedOn to the current date/time if not provided
  const consumedOn = requestBody.consumedOn || new Date().toISOString();
  const isMessageBeingEdited = requestBody.isMessageBeingEdited || false;

  if (!messageId || typeof messageId !== "number") {
    return new Response("Invalid message ID provided", { status: 400 })
}

  if (!aminoUser) {
    return new Response("No amino user found?", { status: 400 })
  }

  // const messageResult = await QuickLogMessage(aminoUser, message)
  let responseMessage = await GenerateResponseForQuickLog(aminoUser, messageId as number, consumedOn, isMessageBeingEdited)

  return NextResponse.json(responseMessage)
}