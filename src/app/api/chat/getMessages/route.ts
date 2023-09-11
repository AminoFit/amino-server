import { NextRequest, NextResponse } from "next/server"
import { authOptions } from "@/app/api/auth/[...nextauth]/auth"
import { GetMessagesForUser } from "../../../../database/GetMessagesForUser"
import { Message } from "@prisma/client"
import { getServerSession } from "next-auth"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json"
      }
    })
  }

  const userId = session.user.userId

  try {
    let messages: Message[] = []
    console.log("userId", userId)
    if (userId) {
      messages = await GetMessagesForUser(userId)
    }
    return new Response(JSON.stringify(messages), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    })
  } catch (error) {
    console.error(error)
    const err = error as Error
    return new Response(
      JSON.stringify({ error: err.message || "Unable to fetch messages" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
  }
}
