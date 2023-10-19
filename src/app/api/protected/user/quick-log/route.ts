export const dynamic = "force-dynamic"

import { QuickLogMessage } from "@/app/api/processMessage"
import { getUserFromRequest } from "@/utils/api-auth-tools"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
  request: NextRequest // needed so we don't cache this request
) {
  console.log("QUICK LOG POST request")
  const user = await getUserFromRequest(request)

  const { message } = await request.json()

  if (!message) {
    return new Response("No message provided", { status: 400 })
  }
  console.log("message", message)
  const messageResult = await QuickLogMessage(user, message)

  console.log("messageResult", messageResult)

  return NextResponse.json(messageResult)
}
