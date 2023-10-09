import { NextRequest, NextResponse } from "next/server"
import { GetMessagesForUser } from "../../../../database/GetMessagesForUser"
import { Message } from "@prisma/client"
import { getSession } from "@auth0/nextjs-auth0"
import { prisma } from "@/database/prisma"

export async function GET(req: NextRequest) {
  const session = await getSession()

  if (!session) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json"
      }
    })
  }

  const userEmail = session.user.email

  const aminoUser = await prisma.user.findUnique({
    where: {
      email: userEmail
    }
  })

  if (!aminoUser) {
    return new Response(JSON.stringify({ error: "Could not find Amino user with that email" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json"
      }
    })
  }

  try {
    let messages: Message[] = []
    console.log("aminoUser", aminoUser)
    if (aminoUser) {
      messages = await GetMessagesForUser(aminoUser.id)
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
    return new Response(JSON.stringify({ error: err.message || "Unable to fetch messages" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    })
  }
}
