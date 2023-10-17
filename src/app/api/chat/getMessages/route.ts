import { prisma } from "@/database/prisma"
import { Message } from "@prisma/client"
import { getServerSession } from "next-auth"
import { NextRequest } from "next/server"
import { GetMessagesForUser } from "../../../../database/GetMessagesForUser"
import { authOptions } from "../../auth/[...nextauth]/route"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.email) {
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
